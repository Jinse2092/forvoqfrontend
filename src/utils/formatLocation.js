export function formatLocation(location) {
  if (!location) return '';
  if (typeof location === 'string') {
    return location;
  }
  const { buildingNumber, location: loc, pincode, phone } = location;
  return \`\${buildingNumber ? buildingNumber + ', ' : ''}\${loc ? loc + ', ' : ''}\${pincode ? pincode + ', ' : ''}\${phone ? 'Phone: ' + phone : ''}\`.replace(/, $/, '');
}
