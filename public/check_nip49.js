
import * as NostrTools from 'https://esm.sh/nostr-tools@1.17.0';
console.log(Object.keys(NostrTools));
if (NostrTools.nip49) {
    console.log('NIP-49 found!');
} else {
    console.log('NIP-49 NOT found.');
}
