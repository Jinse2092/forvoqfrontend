/**
 * Calculate volumetric weight in kg given dimensions in cm.
 * Formula: (length * width * height) / 5000
 * @param {number} length in cm
 * @param {number} width in cm
 * @param {number} height in cm
 * @returns {number} volumetric weight in kg
 */
export function calculateVolumetricWeight(length, width, height) {
  if (!length || !width || !height) return 0;
  return (length * width * height) / 5000;
}

/**
 * Calculate dispatch fee based on weight and packing type.
 * Weight is the higher of actualWeight and volumetricWeight.
 * Pricing rules:
 * - Normal packing: base 7 for < 0.5kg, +2 for each additional 0.5kg
 * - Fragile packing: base 7 for < 0.5kg, +4 for each additional 0.5kg
 * - eco friendly fragile packing: base 7 for < 0.5kg, +5 for each additional 0.5kg
 * @param {number} actualWeight in kg
 * @param {number} volumetricWeight in kg
 * @param {string} packingType one of 'normal packing', 'fragile packing', 'eco friendly fragile packing'
 * @returns {number} dispatch fee in rupees
 */
export function calculateDispatchFee(actualWeight, volumetricWeight, packingType) {
  const weight = Math.max(actualWeight, volumetricWeight);
  let baseFee = 7;
  let additionalFeePerHalfKg = 2;

  switch (packingType) {
    case 'fragile packing':
      baseFee = 11;
      additionalFeePerHalfKg = 4;
      break;
    case 'eco friendly fragile packing':
      baseFee = 12;
      additionalFeePerHalfKg = 5;
      break;
    case 'normal packing':
    default:
      baseFee = 7;
      additionalFeePerHalfKg = 2;
      break;
  }

  if (weight <= 0.5) {
    return baseFee;
  }

  const additionalUnits = Math.ceil((weight - 0.5) / 0.5);
  return baseFee + additionalUnits * additionalFeePerHalfKg;
}

// Utility function to concatenate class names conditionally
export function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}

// Utility function to download data as CSV file
export function downloadCSV(data, filename = 'data') {
  if (!data || !data.length) return;

  const csvRows = [];
  const headers = Object.keys(data[0]);
  csvRows.push(headers.join(','));

  for (const row of data) {
    const values = headers.map(header => {
      const escaped = ('' + (row[header] ?? '')).replace(/"/g, '""');
      return `"${escaped}"`;
    });
    csvRows.push(values.join(','));
  }

  const csvString = csvRows.join('\n');
  const blob = new Blob([csvString], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.setAttribute('hidden', '');
  a.setAttribute('href', url);
  a.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

// Calculate inbound fee based on total weight (higher of actual or volumetric)
// Calculate inbound fee as 5 rupees per 0.5 kg based on higher of actual or volumetric weight
export function calculateInboundFee(actualWeight, volumetricWeight) {
  const weight = Math.max(actualWeight, volumetricWeight);
  const ratePerHalfKg = 5;
  const units = Math.ceil(weight / 0.5);
  return units * ratePerHalfKg;
}
