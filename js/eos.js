let scatterAPI = window.ScatterJS;
window.ScatterJS = null;
scatterAPI.plugins( new ScatterEOS() );

let connected = null;
let connectedTimestamp = 0;
let scatter = null;
let eos = null;

const TIMEOUT_EOS_DEFAULT = 3000

// logD('process.env',process.env);

let network
let eosReadOnly

async function eosInit() {
  network = {
    blockchain:'eos',
    protocol:'https',
    host: EOS_HOST,
    port: EOS_PORT,
    chainId: EOS_CHAINID,

    expireInSeconds: 60,
    broadcast: true,
    verbose: isDebugMode(), // API activity
    sign: true,
  }
  eosReadOnly = Eos (Object.assign({}, network, {
    httpEndpoint: `https://${EOS_READONLY_HOST}`,

    host: EOS_READONLY_HOST,
    port: EOS_READONLY_PORT,
    chainId: EOS_READONLY_CHAINID,
  }));
}

function isScatterAvailable() {
  return connected && scatter && eos
}

async function tryConnectScatter() {
  return await scatterAPI.scatter.connect('DragonGate', {initTimeout:TIMEOUT_EOS_DEFAULT})
}

async function refreshScatterStatus(force) {
  if ((!force) && connected && Date.now() - connectedTimestamp < 5*60*1000) {
    return connected
  }
  connected = await tryConnectScatter()
  connectedTimestamp = Date.now()

  // logD('connecting');
  // If the user does not have Scatter or it is Locked or Closed this will return false;
  if(!connected) return false;
  // logD('connected');

  // logD('scatter', scatterAPI.scatter)

  scatter = scatterAPI.scatter;
  // You can pass in any additional options you want into the eosjs reference.
  const eosOptions = { expireInSeconds:60 };

  // Get a proxy reference to eosjs which you can use to sign transactions with a user's Scatter.
  eos = scatter.eos(network, Eos, eosOptions);
  // eos = Eos(Object.assign({}, eosOptions, {
  //   httpEndpoint:'',
  //   signatureProvider:scatter.eosHook(network),
  // }));
  // logD('eosjs initialized');
  // logD(eos);

  return connected
}
function getIdentityGotBefore() {
  if (scatter) {
    return scatter.identity
  }
}
function getAccountEOSGotBefore() {
  let identity = getIdentityGotBefore()
  // logD('identity', identity)

  if ((!identity) || (identity.account)) {
    return
  }

  // Always use the accounts you got back from Scatter. Never hardcode them even if you are prompting
  // the user for their account name beforehand. They could still give you a different account.
  let account = identity.accounts.find(x => x.blockchain === 'eos')

  return account
}

async function getBalanceByAccountName(accountName) {
  return await getBalanceByAccountNameFromContract("eosio.token", accountName)
}
async function getBalanceByAccountNameFromContract(code, accountName) {
  return await getTableRowsReadOnly({ code: code, scope: accountName, table: "accounts", json: true })
}

async function transfer(toWhom, amount, memo, options) {
  let connected = await refreshScatterStatus()

  // logD('connecting: transfer');
  // If the user does not have Scatter or it is Locked or Closed this will return false;
  if(!connected) return false;
  // logD('connected: transfer');

  let account = getAccountEOSGotBefore();
  // Never assume the account's permission/authority. Always take it from the returned account.
  const transactionOptions = { authorization:[`${account.name}@${account.authority}`] };

  return await eos.transfer(account.name, toWhom, `${amount.toFixed(4)} EOS`, memo, Object.assign({}, transactionOptions, options))
}

async function doAction(targetAccount, actionName, data, options) {
  let connected = await refreshScatterStatus()

  // logD('connecting: transfer');
  // If the user does not have Scatter or it is Locked or Closed this will return false;
  if(!connected) return false;
  // logD('connected: transfer');

  let account = getAccountEOSGotBefore();
  // Never assume the account's permission/authority. Always take it from the returned account.
  const transactionOptions = {
    authorization: [
      {
        actor: account.name,
        permission: account.authority,
      },
    ],
  };

  return await eos.transaction({
    actions: [
      Object.assign({}, transactionOptions, {
        account: targetAccount,
        name: actionName,
        data,
      }),
    ],
  }, options)
}

async function logoutByScatter() {
  if (scatter) {
    let result = await scatter.forgetIdentity()

    await refreshScatterStatus()

    return result
  }
}

async function loginByScatter() {
  let connected = await refreshScatterStatus()

  // logD('connecting');
  // If the user does not have Scatter or it is Locked or Closed this will return false;
  if(!connected) return false;
  // logD('connected');

  // Now we need to get an identity from the user.
  // We're also going to require an account that is connected to the network we're using.
  const requiredFields = { accounts:[network] };

  try {

    // First we need to connect to the user's Scatter.
    let identity = await scatter.getIdentity(requiredFields)
    scatter.identity = identity

    // logD('identity get');
    // logD(identity);

    return identity

  } catch (e) {
    // The user rejected this request, or doesn't have the appropriate requirements.
    console.trace(e);
  } finally {}

  // logD('window closed');
}

// json, code, scope, table, table_key, [lower_bound], [upper_bound], [limit], key_type, index_position
async function getTableRowsReadOnly(args) {
  return await eosReadOnly
    .getTableRows(args)
}
async function getAccountReadOnly(args) {
  return await eosReadOnly
    .getAccount(args)
}

function normalizePrecisionDefault (val) {
  val = +val
  if (!isNaN(val)) {
    let underFloat = 10000
    val /= underFloat
    // val = StringUtils.prettyFloat(val, underFloat)
    val = val.toFixed(4)
  }
  return val
}
