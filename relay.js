import { createLibp2p } from 'libp2p';
import { autoNAT } from '@libp2p/autonat';
import { identify, identifyPush } from '@libp2p/identify';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { gossipsub } from '@chainsafe/libp2p-gossipsub';
import { floodsub } from '@libp2p/floodsub';
import { webSockets } from '@libp2p/websockets';
import { tcp } from '@libp2p/tcp';
import { circuitRelayServer } from '@libp2p/circuit-relay-v2';
import { PUBSUB_PEER_DISCOVERY } from './constants.js';
import { generateKeyPair, generateKeyPairFromSeed } from '@libp2p/crypto/keys';
import { kadDHT, removePublicAddressesMapper, removePrivateAddressesMapper } from '@libp2p/kad-dht';
import { ping } from '@libp2p/ping';
//import { peerIdFromString } from '@libp2p/peer-id';
//import bootstrappers from './bootstrappers.js';
import log from 'loglevel';
import { program, Option } from 'commander'

program.version('0.0.1');
program
  .option('-d, --debug', 'enable debug logging', false)
  .option('-a, --announce <ip>', 'announce public ip addresse',
    '106.15.108.69')
program.parse(process.argv);

const opts = program.opts();
if (opts.debug) log.setLevel('debug');
else log.setLevel('info');

log.debug('Options:');
log.debug(opts);

const seed = new Uint8Array([
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 
  17, 18, 19, 20, 21, 22, 23, 24, 24, 26, 27, 28, 29, 30, 31,
]);
var keypair = await generateKeyPairFromSeed('Ed25519', seed);

async function main() {
  const node = await createLibp2p({
    privateKey: keypair,
    addresses: {
      listen: [
        '/ip4/0.0.0.0/tcp/9001/ws',
        '/ip4/0.0.0.0/tcp/9002',
      ],
      appendAnnounce: [
        `/ip4/${opts.announce}/tcp/9001/ws`,
        `/ip4/${opts.announce}/tcp/9002`
      ],
    },
    transports: [webSockets(), tcp()],
    connectionGater: {
      // Allow private addresses for local testing
      denyDialMultiaddr: async () => false,
    },
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: {
      identify: identify(),
      autoNat: autoNAT(),
      relay: circuitRelayServer({
        reservations: {
          maxReservations: Infinity,
        },
      }),
      pubsub: gossipsub(),
      /*
         aminoDHT: kadDHT({
         protocol: '/ipfs/kad/1.0.0',
         peerInfoMapper: removePrivateAddressesMapper,
         clientMode: false,
         }),
         dht: kadDHT({
         protocol: '/ipfs/lan/kad/1.0.0',
         peerInfoMapper: removePublicAddressesMapper,
         clientMode: false,
         logPrefix: 'libp2p:dht-lan',
         datastorePrefix: '/dht-lan',
         metricsPrefix: 'libp2p_dht_lan',
         }),
       */
    },
  });

  log.info('PeerID: ', node.peerId.toString());
  log.info('Multiaddrs: ', node.getMultiaddrs());

  node.addEventListener('peer:discovery', async (evt) => {
    log.debug(`peer:discovery: ${evt.detail.id.toString()}`);
    log.debug(evt.detail);
  });

  node.addEventListener('peer:connect', async (evt) => {
    const remotePeer = evt.detail;
    log.debug('peer:connect: ', remotePeer.toString());
    const connectedPeers = node.getPeers();
    log.debug(`total: ${connectedPeers.length} peers.`);
  });
  node.addEventListener('peer:disconnect', async (evt) => {
    const remotePeer = evt.detail;
    log.debug('peer:disconnect: ', remotePeer.toString());
    const connectedPeers = node.getPeers();
    log.debug(`total: ${connectedPeers.length} peers.`);
  });

  node.services.pubsub.addEventListener('message', (evt) => {
    //log.debug(`message: ${evt.detail.topic}`);
  });

  await node.services.pubsub.subscribe(PUBSUB_PEER_DISCOVERY);
}

main();
