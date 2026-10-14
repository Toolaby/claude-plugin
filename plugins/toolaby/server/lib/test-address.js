// Generated from wall/src/packages/wiring/test-address.ts by wall/scripts/pack-create.mjs — edit there.
/**
 * A Test workspace's address, as Clerk gives a development instance one (`<slug>.clerk.accounts.dev`): made by Toolaby,
 * never chosen, never changed — `quiet-otter-4172.toolaby.app/test`. Test and Live share Toolaby's addresses, and a
 * name is Live's: a Test workspace served under its chosen name sat at the address that name has on Live, which
 * someone else could hold (29 Sep 2026). A Test address is of a shape no workspace may take as its name, on either side
 * (isReservedSlug), so no Live workspace ever answers at one.
 *
 * The database computes it, from the workspace's id, which never changes (the column `test_address`, generated; its
 * migration writes testAddressSql() out as it stands here). So neither list may ever change: every Test workspace's
 * address, and every Test key that names one, would move.
 */
export const TEST_ADDRESS_ADJECTIVES = [
    'amber', 'bold', 'brave', 'bright', 'brisk', 'calm', 'clever', 'cosmic', 'crisp', 'curious', 'daring', 'eager', 'early', 'fancy', 'fluffy', 'gentle',
    'glad', 'golden', 'happy', 'hardy', 'honest', 'humble', 'jolly', 'keen', 'kind', 'lively', 'lucky', 'lunar', 'mellow', 'merry', 'mighty', 'misty',
    'modest', 'nimble', 'noble', 'patient', 'plucky', 'polite', 'proud', 'quick', 'quiet', 'rapid', 'ready', 'rosy', 'rustic', 'shiny', 'silent', 'silver',
    'smooth', 'snowy', 'solar', 'spry', 'steady', 'sturdy', 'sunny', 'swift', 'tidy', 'tranquil', 'trusty', 'vivid', 'warm', 'wise', 'witty', 'zesty',
];
export const TEST_ADDRESS_ANIMALS = [
    'badger', 'beaver', 'bison', 'bobcat', 'camel', 'cheetah', 'crane', 'dingo', 'dolphin', 'eagle', 'falcon', 'ferret', 'finch', 'fox', 'gazelle', 'gecko',
    'heron', 'hippo', 'ibis', 'jaguar', 'koala', 'lemur', 'leopard', 'llama', 'lynx', 'magpie', 'marmot', 'marten', 'meerkat', 'mink', 'moose', 'narwhal',
    'newt', 'ocelot', 'orca', 'osprey', 'otter', 'owl', 'panda', 'panther', 'parrot', 'pelican', 'penguin', 'puffin', 'quail', 'rabbit', 'raven', 'robin',
    'salmon', 'seal', 'sparrow', 'stork', 'swan', 'tapir', 'tiger', 'toucan', 'turtle', 'walrus', 'weasel', 'whale', 'wombat', 'wren', 'yak', 'zebra',
];
const ADJECTIVES = new Set(TEST_ADDRESS_ADJECTIVES);
const ANIMALS = new Set(TEST_ADDRESS_ANIMALS);
const SHAPE = /^([a-z]+)-([a-z]+)-([1-9]\d{3})$/;
/** Whether a name is of a Test address's shape: one of the adjectives, one of the animals, a number of four digits. */
export function isTestAddress(s) {
    if (typeof s !== 'string')
        return false;
    const m = SHAPE.exec(s);
    return !!m && ADJECTIVES.has(m[1]) && ANIMALS.has(m[2]);
}
/**
 * The address from the four first bytes of md5 of the id: an adjective, an animal, 1000 + a number below 9000. As SQL,
 * for the column the database generates; a test holds the migration to it, and computes the same in Node.
 */
export function testAddressSql(id = 'id') {
    const h = `decode(md5(${id}), 'hex')`;
    const list = (words) => `(array[${words.map((w) => `'${w}'`).join(', ')}]::text[])`;
    return `${list(TEST_ADDRESS_ADJECTIVES)}[1 + get_byte(${h}, 0) % ${TEST_ADDRESS_ADJECTIVES.length}] || '-' || ${list(TEST_ADDRESS_ANIMALS)}[1 + get_byte(${h}, 1) % ${TEST_ADDRESS_ANIMALS.length}] || '-' || (1000 + (get_byte(${h}, 2) * 256 + get_byte(${h}, 3)) % 9000)::text`;
}
