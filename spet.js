import { program, Option } from 'commander'
import { fromString as uint8ArrayFromString } from 'uint8arrays/from-string';
import { toString as uint8ArrayToString } from 'uint8arrays/to-string';
import log from 'loglevel';

import readline from 'node:readline';
import process from 'node:process';

import { createNode } from './createnode.js';
import { getAddresses, getPeerDetails, getPeerTypes } from './utils.js';
import { tr } from 'date-fns/locale';

let users = new Map();
let points = new Map();
let topics = new Map([
  ['story', "story"],
  ['estimation', "estimation"],
  ['result', "result"],
  ['user', "user"]

]);

program.version('0.0.1');
program
  .description('story point estimation tool')
  .option('-i, --room <id>', 'room identifier', 'spetroom')
  .option('-a, --addr <multiaddr>', 'relay address',
    '/ip4/106.15.108.69/tcp/9001/ws/p2p/12D3KooWPYze48sqQ2wUbkS9RHpuJ2CRNCrTZG3Bj6KvXTygHsHr')
  .addOption(new Option('-m, --method <name>', 'estimation method')
    .choices(['free-number', 't-thirt', 'fibonacci', 'modified-fibonacci', 'powers-of-two'])
    .default('free-number'))
  .option('-H, --hide', 'hide the estimation results until the end')
  .option('-n, --name <name>', 'your name', 'undefined')
  .option('-d, --debug', 'enable debug logging', false)
program.parse(process.argv);
const opts = program.opts();

if (opts.debug) log.setLevel('debug') 
else log.setLevel('info');

log.debug('Options:');
log.debug(opts);

const node = await createNode(log, opts.addr);
log.info('PeerID: ', node.peerId.toString());
log.debug('Multiaddrs: ', node.getMultiaddrs());

for (let [key, value] of topics) {
  topics.set(key, value + "_" + opts.room);
  await node.services.pubsub.subscribe(topics.get(key));
}
setInterval(
  async () => {
    try {
      await node.services.pubsub.publish(topics.get('user'), uint8ArrayFromString(opts.name ?? ''))
    } catch (err) {
      log.error('Failed to publish user info:', err);
    }
  }, 5000);
node.addEventListener('peer:disconnect', async (evt) => {
  const remotePeer = evt.detail;
  log.debug('peer:disconnect: ', remotePeer.toString());
  const connectedPeers = node.getPeers();
  log.debug(`connection count: ${connectedPeers.length} peers.`);
  users.delete(remotePeer.toString());
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '$ ',
});
rl.on('line', (line) => {
  line = line.trim();
  const [cmd, ...rest] = line.split(' ');
  const arg = rest.join(' ');
  switch (cmd) {
    case 'story': {
      handleStory(arg);
      break;
    }
    case 'result': {
      break;
    }
    case 'stats': {
      handleStats(node);
      break;
    }
    case 'users': {
      console.log(users);
      break;
    }
    case 'quit' || 'q' : {
      console.log('Bye!');
      process.exit(0);
    }
    case 'help':
    default: {
      handleHelp();
    }
  }
  rl.prompt(true);
});

rl.prompt(true);

function handleHelp() {
  console.log(
' Commands available \n\
 --------------------------------------\n\
 story   describe a story \n\
 result  show result \n\
 help    show this help \n\
 stats   show stats \n\
 users   list connected users \n\
 quit    quit the app \n',
 );
}

function handleStory(arg) {
  node.services.pubsub
    .publish(topics.get('story'), uint8ArrayFromString(arg))
    .catch((err) => {
      log.error(err);
    });
  
}

function handleStats(node) {
  console.log('\n');
  console.log('Addresses:');
  console.log(getAddresses(node));
  console.log('Topics:');
  console.log(node.services.pubsub.getTopics());
  console.log('Peer Types:');
  console.log(getPeerTypes(node));
  console.log('Peer Details:');
  console.log(getPeerDetails(node));
  console.log('\n');

}
const uint8ArrayFromJson = (json) => {
  const jsonString = JSON.stringify(json); // Convert JSON object to string
  return uint8ArrayFromString(jsonString); // Convert string to Uint8Array
};

node.services.pubsub.addEventListener('message', (evt) => {
  log.debug(`message: ${evt.detail.topic}`);
  if (evt.detail.topic == topics.get('story')) {
    onStory(evt.detail.data);
  } else if (evt.detail.topic == topics.get('result')) {
    //onResult(evt.detail.data);
  } else if (evt.detail.topic == topics.get('estimation')) {
    onEstimation(evt);
  } else if (evt.detail.topic == topics.get('user')) {
    users.set(evt.detail.from.toString(), uint8ArrayToString(evt.detail.data));
  }

  rl.prompt(true);
})

function onStory(arg) {
  const storyDesc = uint8ArrayToString(arg);
  console.log('story: ', storyDesc);
  rl.question('input story point: ', (input) => {
    try {
      node.services.pubsub.publish(topics.get('estimation'), uint8ArrayFromString(input ?? ''))
    } catch (err) {
      log.error('Failed to publish result info:', err);
    }
  });
}

function onEstimation(evt) {
  const id = evt.detail.from.toString();
  const point = uint8ArrayToString(evt.detail.data);
  points.set(id, point);
  log.info('estimation from ', id, ': ', point);
  log.info('current points: ', points);
}

function onResult() {
  var res = {};
  res.min = 1;
  res.max = 5;
  res.avg = 2;

  node.services.pubsub.publish(topics.get('result'), uint8ArrayFromJson(res)).catch((_err) => {
    //console.error(_err)
  });
}


