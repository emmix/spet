import { program, Option } from 'commander'
import { fromString as uint8ArrayFromString } from 'uint8arrays/from-string';
import { toString as uint8ArrayToString } from 'uint8arrays/to-string';
import log from 'loglevel';

import readline from 'node:readline';
import process from 'node:process';

import { createNode } from './createnode.js';
import { Topics } from './constants.js';
import { getAddresses, getPeerDetails, getPeerTypes } from './utils.js';

const story = 'story';
const estimation = 'estimation';
const result = 'result';

program.version('0.0.1');
program
  .description('story point estimation tool')
  .option('-i, --room <id>', 'room identifier', '')
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

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '$ ',
});

const node = await createNode(log, opts.addr);
log.info('PeerID: ', node.peerId.toString());
log.info('Multiaddrs: ', node.getMultiaddrs());

await Promise.all(Topics.map((topic) =>
  node.services.pubsub.subscribe(topic)));

node.services.pubsub.addEventListener('message', (evt) => {
  //log.debug(`message: ${evt.detail.topic}`);

  if (evt.detail.topic == story) {
    estimatePoint(evt.detail.data);
  } else if (evt.detail.topic == result) {
    showResult(evt.detail.data);
  }
  if (evt.detail.topic == estimation) {
    log.info(`estimation: ${uint8ArrayToString(evt.detail.data)}`);
    rl.prompt();
  }
})

rl.prompt();
rl.on('line', (line) => {
  line = line.trim();
  const [cmd, ...rest] = line.split(' ');
  const arg = rest.join(' ');
  switch (cmd) {
    case 'story': {
      describeStory(arg);
      break;
    }
    case 'point': {
      estimatePoint(arg);
      break;
    }
    case 'result': {
      showResult();
      break;
    }
    case 'stats': {
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
      break;
    }
    case 'quit' || 'q' : {
      console.log('Bye!');
      process.exit(0);
    }
    case 'help':
    default: {
      showHelp();
    }
  }

  rl.prompt();
});



function showHelp() {
  console.log(
    '\nCommands available\n\
  --------------------------------------\n\
  story   describe a story \n\
  result  show result \n\
  help    show this help \n\
  stats   show stats \n\
  quit    quit the app \n',
  );
}

const uint8ArrayFromJson = (json) => {
  const jsonString = JSON.stringify(json); // Convert JSON object to string
  return uint8ArrayFromString(jsonString); // Convert string to Uint8Array
};

function describeStory(arg) {
  log.debug(arg);
  node.services.pubsub
    .publish(story, uint8ArrayFromString(arg))
    .catch((err) => {
      log.error(err);
    });
}

function showResult() {
  var res = {};
  res.min = 1;
  res.max = 5;
  res.avg = 2;
  node.services.pubsub.publish(result, uint8ArrayFromJson(res)).catch((_err) => {
    //console.error(_err)
  });
}

function estimatePoint(arg) {
  const storyDesc = uint8ArrayToString(arg);
  console.log('story: ', storyDesc);
  rl.question('input story point: ', (input) => {
    node.services.pubsub.publish(estimation, uint8ArrayFromString(input))
      .catch((_err) => {});
  });
}
