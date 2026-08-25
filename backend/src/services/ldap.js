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
  return process.env.LDAP_USER_SEARCH_BASE || process.env.LDAP_USERS_OU || process.env.LDAP_BASE_DN || 'DC=argos,DC=local';
}

function getLeaderGroup() {
  return process.env.LDAP_ADMIN_GROUP || process.env.LDAP_GROUP_AUDITORES_LIDERES || 'Qualidade';
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

function checkIsLider(memberOfList, targetGroup) {
  if (!targetGroup) return false;
  const targetLower = targetGroup.toLowerCase().trim();
  return memberOfList.some((dn) => {
    if (!dn) return false;
    const dnLower = typeof dn === 'string' ? dn.toLowerCase() : '';
    if (dnLower === targetLower) return true;
    if (dnLower.startsWith(`cn=${targetLower},`) || dnLower.includes(`cn=${targetLower}`)) return true;
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

  // 2. Busca informações do usuário (displayName, memberOf, email)
  const searchBase = getSearchBase();
  const leaderGroup = getLeaderGroup();
  let entries = [];

  // Tenta buscar primeiro com a própria conexão autenticada do usuário
  try {
    entries = await searchAsync(userClient, searchBase, {
      scope: 'sub',
      filter: `(|(sAMAccountName=${bareUsername})(userPrincipalName=${userPrincipal}))`,
      attributes: ['displayName', 'memberOf', 'sAMAccountName', 'mail'],
    });
  } catch (err) {
    console.warn('[ldap] busca com usuário falhou, tentando conta de serviço...', err.message);
  } finally {
    try { userClient.unbind(); } catch (_) {}
  }

  // Se não encontrou e temos conta de serviço configurada, tenta com ela
  const bindDn = process.env.LDAP_BIND_DN;
  const bindPass = process.env.LDAP_BIND_PASSWORD;
  if (entries.length === 0 && bindDn && bindPass) {
    const svcClient = createClient();
    try {
      await bindAsync(svcClient, bindDn, bindPass);
      entries = await searchAsync(svcClient, searchBase, {
        scope: 'sub',
        filter: `(|(sAMAccountName=${bareUsername})(userPrincipalName=${userPrincipal}))`,
        attributes: ['displayName', 'memberOf', 'sAMAccountName', 'mail'],
      });
    } catch (svcErr) {
      console.warn('[ldap] busca com conta de serviço falhou:', svcErr.message);
    } finally {
      try { svcClient.unbind(); } catch (_) {}
    }
  }

  // Se encontrou a entrada no AD, extrai os detalhes
  if (entries.length > 0) {
    const user = entries[0];
    const memberOf = [].concat(user.attributes?.find((a) => a.type === 'memberOf')?.values || user.memberOf || []);
    const isLider = checkIsLider(memberOf, leaderGroup);

    const getAttr = (name) => {
      const found = user.attributes?.find((a) => a.type === name);
      return found ? found.values[0] : user[name];
    };

    return {
      username: bareUsername,
      displayName: getAttr('displayName') || bareUsername,
      email: getAttr('mail') || null,
      isLider,
    };
  }

  // Fallback: se o usuário autenticou com sucesso mas os atributos não puderam ser lidos
  return {
    username: bareUsername,
    displayName: bareUsername,
    email: null,
    isLider: false,
  };
}

module.exports = { authenticate };
