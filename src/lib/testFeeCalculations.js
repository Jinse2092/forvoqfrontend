import { calculateDispatchFee, calculateInboundFee } from './utils.js';

const testCases = [
  { weight: 0.12, packingType: 'normal packing' },
  { weight: 0.12, packingType: 'fragile packing' },
  { weight: 0.12, packingType: 'eco friendly fragile packing' },
  { weight: 0.6, packingType: 'normal packing' },
  { weight: 0.6, packingType: 'fragile packing' },
  { weight: 0.6, packingType: 'eco friendly fragile packing' },
  { weight: 1.2, packingType: 'normal packing' },
  { weight: 1.2, packingType: 'fragile packing' },
  { weight: 1.2, packingType: 'eco friendly fragile packing' },
];

console.log('Testing calculateDispatchFee:');
for (const { weight, packingType } of testCases) {
  const fee = calculateDispatchFee(weight, weight, packingType);
  console.log(`Weight: ${weight}kg, Packing: ${packingType}, Dispatch Fee: ₹${fee}`);
}

console.log('\nTesting calculateInboundFee:');
for (const { weight, packingType } of testCases) {
  const fee = calculateInboundFee(weight, weight, packingType);
  console.log(`Weight: ${weight}kg, Packing: ${packingType}, Inbound Fee: ₹${fee}`);
}
