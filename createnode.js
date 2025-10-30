import { createLibp2p } from 'libp2p';
import { autoNAT } from '@libp2p/autonat';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { identify, identifyPush } from '@libp2p/identify';
import { tcp } from '@libp2p/tcp';
import { gossipsub } from '@chainsafe/libp2p-gossipsub';
//import { floodsub } from '@libp2p/floodsub';
import { webSockets } from '@libp2p/websockets';
import { webTransport } from '@libp2p/webtransport';
import { webRTC } from '@libp2p/webrtc'
//import { webRTCDirect } from '@libp2p/webrtc'
import { pubsubPeerDiscovery } from '@libp2p/pubsub-peer-discovery';
import { bootstrap } from '@libp2p/bootstrap';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { circuitRelayServer } from '@libp2p/circuit-relay-v2';
import { generateKeyPair, generateKeyPairFromSeed } from '@libp2p/crypto/keys';
import { kadDHT, removePublicAddressesMapper, removePrivateAddressesMapper } from '@libp2p/kad-dht';
//import { ping } from '@libp2p/ping';
import { peerIdFromString } from '@libp2p/peer-id';
import { getPeerTypes, getAddresses, getPeerDetails } from './utils.js';
import { PUBSUB_PEER_DISCOVERY } from './constants.js';
//import { bootstrappers } from './bootstrappers.js';

export async function createNode(log, bootstrapAddr) {
  const node = await createLibp2p({
    addresses: {
      listen: [
        // Required to create circuit relay reservations in order to hole punch
        // browser-to-browser WebRTC connections
        '/p2p-circuit',
        // Listen for webRTC connections
        '/webrtc',
      ],
    },
    transports: [
      webSockets(),
      webTransport(),
      webRTC(),
      circuitRelayTransport(),
    ],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    connectionGater: {
      // Allow private addresses for local testing
      denyDialMultiaddr: async () => false,
    },
    connectionManager: {
      dialTimeout: 30000 // 30 seconds
    },
    peerDiscovery: [
      bootstrap({
        list: [bootstrapAddr],
        //list: bootstrappers,
      }),
      pubsubPeerDiscovery({
        interval: 10_000, //ms
        topics: [PUBSUB_PEER_DISCOVERY],
      }),
    ],
    services: {
      pubsub: gossipsub({
        allowPublishToZeroTopicPeers: true,
        emitSelf: true,
      }),
      identify: identify(),
    }
  });

  // 👇 Dial peers discovered via pubsub
  node.addEventListener('peer:discovery', async (evt) => {
    log.debug(`peer:discovery: ${evt.detail.id.toString()}`);
    log.debug(evt.detail);

    const connectedPeers = node.getPeers();
    log.debug(`connection count: ${connectedPeers.length} peers.`);

    // Encapsulate the multiaddrs with the peer ID to ensure correct dialing
    // Should be fixed when https://github.com/libp2p/js-libp2p/issues/3239 is resolved.
    const maddrs = evt.detail.multiaddrs.map((ma) => ma.encapsulate(`/p2p/${evt.detail.id.toString()}`))
    log.debug(`Dialing peer at address(es): ${maddrs}`);
    try {
      if (maddrs.length != 0) await node.dial(maddrs) // dial the new peer
    } catch (err) {
      console.error(`Failed to dial peer (${maddrs}):`, err)
    }
  });

  node.addEventListener('peer:connect', async (evt) => {
    const remotePeer = evt.detail;
    log.debug('peer:connect: ', remotePeer.toString());
    const connectedPeers = node.getPeers();
    log.debug(`connection count: ${connectedPeers.length} peers.`);
  });
 

  return node;
}
