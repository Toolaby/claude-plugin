// Generated from Toolaby's wiring rules: do not edit by hand.
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
export function isTestAddress(s) {
    if (typeof s !== 'string')
        return false;
    const m = SHAPE.exec(s);
    return !!m && ADJECTIVES.has(m[1]) && ANIMALS.has(m[2]);
}
export function testAddressSql(id = 'id') {
    const h = `decode(md5(${id}), 'hex')`;
    const list = (words) => `(array[${words.map((w) => `'${w}'`).join(', ')}]::text[])`;
    return `${list(TEST_ADDRESS_ADJECTIVES)}[1 + get_byte(${h}, 0) % ${TEST_ADDRESS_ADJECTIVES.length}] || '-' || ${list(TEST_ADDRESS_ANIMALS)}[1 + get_byte(${h}, 1) % ${TEST_ADDRESS_ANIMALS.length}] || '-' || (1000 + (get_byte(${h}, 2) * 256 + get_byte(${h}, 3)) % 9000)::text`;
}
