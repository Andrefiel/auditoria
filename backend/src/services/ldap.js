const ldap = require('ldapjs');

const LDAP_UPN_SUFFIX = process.env.LDAP_UPN_SUFFIX || 'argos.local';

function getLdapUrl() {
  if (process.env.LDAP_URL) return process.env.LDAP_URL;
  const server = process.env.LDAP_SERVER || '192.168.0.4';
  const port = process.env.LDAP_PORT || (process.env.LDAP_USE_SSL === 'true' ? 636 : 389);
  const proto = (process.env.LDAP_USE_SSL === 'true' || String(port) === '636') ? 'ldaps' : 'ldap';
  return `${proto}://${server}:${port}`;
}

function getSearchBase() {
  return process.env.LDAP_BASE_DN || process.env.LDAP_USER_SEARCH_BASE || process.env.LDAP_USERS_OU || 'DC=argos,DC=local';
}

function getLeaderGroup() {
  return process.env.LDAP_ADMIN_GROUP || process.env.LDAP_GROUP_AUDITORES_LIDERES || 'auditores_lideres';
}

function createClient() {
  const url = getLdapUrl();
  const client = ldap.createClient({ url, timeout: 5000, connectTimeout: 5000 });
  // Sem este listener, um erro de conexão (AD fora do ar, timeout, etc.)
  // derruba o processo inteiro do Node — não só a requisição atual.
  client.on('error', (err) => {
    console.error('[ldap] erro de conexão:', err.message);
  });
  return client;
}

function bindAsync(client, dn, password) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const onError = (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    };
    client.once('error', onError);
    client.bind(dn, password, (err) => {
      if (settled) return;
      settled = true;
      client.removeListener('error', onError);
      err ? reject(err) : resolve();
    });
  });
}

function searchAsync(client, base, options) {
  return new Promise((resolve, reject) => {
    const entries = [];
    client.search(base, options, (err, res) => {
      if (err) return reject(err);
      res.on('searchEntry', (entry) => entries.push(entry.pojo || entry.object));
      res.on('error', (e) => reject(e));
      res.on('end', () => resolve(entries));
    });
  });
}

function extractValues(user, attrName) {
  const target = attrName.toLowerCase();
  if (Array.isArray(user.attributes)) {
    const attr = user.attributes.find((a) => (a.type || '').toLowerCase() === target);
    if (attr) return Array.isArray(attr.values) ? attr.values : [attr.values];
  }
  if (user[attrName]) {
    return Array.isArray(user[attrName]) ? user[attrName] : [user[attrName]];
  }
  return [];
}

function checkIsLider(memberOfList, targetGroup) {
  if (!targetGroup) return false;
  const targetLower = targetGroup.toLowerCase().trim();
  return memberOfList.some((dn) => {
    if (!dn || typeof dn !== 'string') return false;
    const dnLower = dn.toLowerCase();
    if (dnLower === targetLower) return true;
    if (dnLower.includes(`cn=${targetLower},`) || dnLower.endsWith(`cn=${targetLower}`)) return true;
    if (dnLower.includes(targetLower)) return true;
    return false;
  });
}

/**
 * Autentica o usuário contra o AD e verifica se ele pertence
 * ao grupo de líderes / admin.
 * @returns {Promise<{username:string, displayName:string, isLider:boolean, email:string|null}>}
 */
async function authenticate(username, password) {
  const userClient = createClient();
  const bareUsername = username.replace(/@.*$/, '').replace(/^.*\\/, '');
  
  let userPrincipal = username;
  if (!username.includes('@') && !username.includes('\\')) {
    userPrincipal = `${username}@${LDAP_UPN_SUFFIX}`;
  }

  // 1. Valida usuário e senha contra o Active Directory
  try {
    await bindAsync(userClient, userPrincipal, password);
  } catch (err) {
    try { userClient.unbind(); } catch (_) {}
    if (err.name === 'ConnectionError' || err.code === 'ECONNREFUSED' || err.name === 'TimeoutError') {
      const connError = new Error('Não foi possível conectar ao Active Directory');
      connError.code = 'LDAP_UNAVAILABLE';
      throw connError;
    }
    const authError = new Error('Usuário ou senha inválidos');
    authError.code = 'INVALID_CREDENTIALS';
    throw authError;
  }

  const baseDn = process.env.LDAP_BASE_DN || 'DC=argos,DC=local';
  const leaderGroup = getLeaderGroup();
  let entries = [];
  let userDn = null;

  try {
    // 2. Busca informações do usuário (displayName, memberOf, email) a partir da raiz do domínio
    try {
      entries = await searchAsync(userClient, baseDn, {
        scope: 'sub',
        filter: `(|(sAMAccountName=${bareUsername})(userPrincipalName=${userPrincipal}))`,
        attributes: ['displayName', 'memberOf', 'sAMAccountName', 'mail', 'distinguishedName'],
      });
    } catch (err) {
      console.warn('[ldap] busca de atributos com usuário falhou:', err.message);
    }

    // Se encontrou a entrada no AD, extrai os detalhes
    if (entries.length > 0) {
      const user = entries[0];
      userDn = user.dn || extractValues(user, 'distinguishedName')[0] || null;
      const memberOf = extractValues(user, 'memberOf');
      let isLider = checkIsLider(memberOf, leaderGroup);

      // Se ainda não deu match por memberOf, tenta busca direta nos membros do grupo
      if (!isLider) {
        try {
          const groupEntries = await searchAsync(userClient, baseDn, {
            scope: 'sub',
            filter: `(|(cn=${leaderGroup})(sAMAccountName=${leaderGroup}))`,
            attributes: ['member', 'distinguishedName'],
          });

          if (groupEntries.length > 0) {
            const members = extractValues(groupEntries[0], 'member').map((m) => String(m).toLowerCase());
            if (userDn && members.includes(userDn.toLowerCase())) {
              isLider = true;
            }
          }
        } catch (gErr) {
          console.warn('[ldap] consulta direta no grupo falhou:', gErr.message);
        }
      }

      const displayNameArr = extractValues(user, 'displayName');
      const mailArr = extractValues(user, 'mail');
      const displayName = displayNameArr[0] || bareUsername;
      const email = mailArr[0] || null;

      console.log(`[ldap] Login com sucesso: ${bareUsername} (${displayName}) | Líder: ${isLider} (Grupo configurado: "${leaderGroup}")`);
      if (memberOf.length > 0) {
        console.log(`[ldap] Grupos do usuário (${memberOf.length}):`, memberOf);
      }

      return {
        username: bareUsername,
        displayName,
        email,
        isLider,
      };
    }
  } finally {
    try { userClient.unbind(); } catch (_) {}
  }

  console.log(`[ldap] Login efetuado: ${bareUsername} (atributos não retornados) | Líder: false`);

  return {
    username: bareUsername,
    displayName: bareUsername,
    email: null,
    isLider: false,
  };
}

module.exports = { authenticate };
