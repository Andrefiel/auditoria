const ldap = require('ldapjs');

const LDAP_URL = process.env.LDAP_URL;
const LDAP_BIND_DN = process.env.LDAP_BIND_DN;
const LDAP_BIND_PASSWORD = process.env.LDAP_BIND_PASSWORD;
const LDAP_USER_SEARCH_BASE = process.env.LDAP_USER_SEARCH_BASE;
const LDAP_GROUP_AUDITORES_LIDERES = process.env.LDAP_GROUP_AUDITORES_LIDERES;
const LDAP_UPN_SUFFIX = process.env.LDAP_UPN_SUFFIX || 'argos.local';

function createClient() {
  const client = ldap.createClient({ url: LDAP_URL, timeout: 5000, connectTimeout: 5000 });
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

/**
 * Autentica o usuário contra o AD e verifica se ele pertence
 * ao grupo auditores_lideres.
 * @returns {Promise<{username:string, displayName:string, isLider:boolean}>}
 */
async function authenticate(username, password) {
  const userClient = createClient();
  const userPrincipal = username.includes('@') ? username : `${username}@${LDAP_UPN_SUFFIX}`;

  try {
    await bindAsync(userClient, userPrincipal, password);
  } catch (err) {
    userClient.unbind();
    if (err.name === 'ConnectionError' || err.code === 'ECONNREFUSED') {
      const connError = new Error('Não foi possível conectar ao Active Directory');
      connError.code = 'LDAP_UNAVAILABLE';
      throw connError;
    }
    const authError = new Error('Usuário ou senha inválidos');
    authError.code = 'INVALID_CREDENTIALS';
    throw authError;
  }
  userClient.unbind();

  // Segunda conexão, com a conta de serviço, pra buscar displayName e memberOf
  const svcClient = createClient();
  try {
    await bindAsync(svcClient, LDAP_BIND_DN, LDAP_BIND_PASSWORD);

    const bareUsername = username.replace(/@.*$/, '');
    const entries = await searchAsync(svcClient, LDAP_USER_SEARCH_BASE, {
      scope: 'sub',
      filter: `(sAMAccountName=${bareUsername})`,
      attributes: ['displayName', 'memberOf', 'sAMAccountName', 'mail'],
    });

    if (entries.length === 0) {
      const err = new Error('Usuário autenticado, mas não encontrado no diretório');
      err.code = 'USER_NOT_FOUND';
      throw err;
    }

    const user = entries[0];
    const memberOf = [].concat(user.attributes?.find((a) => a.type === 'memberOf')?.values || user.memberOf || []);
    const isLider = memberOf.some(
      (dn) => dn.toLowerCase() === LDAP_GROUP_AUDITORES_LIDERES.toLowerCase()
    );

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
  } finally {
    svcClient.unbind();
  }
}

module.exports = { authenticate };
