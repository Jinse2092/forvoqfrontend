import jsPDF from 'jspdf';

export function generateShippingLabelPDF(order, merchant) {
  console.log('Generating shipping label for order:', order);
  console.log('City:', order.city, 'State:', order.state);
  const doc = new jsPDF();
  doc.setFontSize(16);

  // Left side - ORDER ID and FROM (merchant info)
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(`ORDER ID: ${order.id}`, 10, 40);

  doc.text('FROM:', 10, 55);
  doc.text(`Name: ${merchant.companyName}`, 10, 65);
  doc.text(`ID: ${merchant.id}`, 10, 75);
  doc.text('Address: Kaiprumpattu House, kidangoor p.o', 10, 85);
  doc.text('kovattu temple,kidangoor', 10, 95);
  doc.text(`City: Angamaly State: Kerala PIN: 683572`, 10, 105);
  doc.text('Phone: 7902819040', 10, 115);

  // Right side - TO (customer info)
  const rightX = 140;
  doc.setFont('helvetica', 'bold');
  doc.text('TO:', rightX, 55);
  doc.text(`Name: ${order.customerName}`, rightX, 65);

  let y = 75;
  const lineHeight = 7;
  const maxWidth = 50;

  // Address
  const addressLines = doc.splitTextToSize(`Address: ${order.address}`, maxWidth);
  doc.text(addressLines, rightX, y);
  y += addressLines.length * lineHeight;

  // City/State/Pin
  const cityStatePin = `City: ${order.city || ''} State: ${order.state || ''} PIN: ${order.pincode || ''}`;
  const cityStatePinLines = doc.splitTextToSize(cityStatePin, maxWidth);
  doc.text(cityStatePinLines, rightX, y);
  y += cityStatePinLines.length * lineHeight;

  // Phone
  const phoneLines = doc.splitTextToSize(`Phone: ${order.phone || ''}`, maxWidth);
  doc.text(phoneLines, rightX, y);

  doc.save(`shipping-label-${order.id}.pdf`);
}
