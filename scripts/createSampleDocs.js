const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');

async function createPdfContract(filename, title, sections) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const page = pdfDoc.addPage([595.28, 841.89]); // A4 Size
  const { width, height } = page.getSize();

  let yPos = height - 50;

  // Title
  page.drawText(title, {
    x: 50,
    y: yPos,
    size: 16,
    font: boldFont,
    color: rgb(0.1, 0.2, 0.5),
  });

  yPos -= 35;

  for (const sec of sections) {
    if (yPos < 60) break;

    // Heading
    page.drawText(sec.heading, {
      x: 50,
      y: yPos,
      size: 12,
      font: boldFont,
      color: rgb(0.2, 0.2, 0.2),
    });

    yPos -= 18;

    // Body lines
    const words = sec.text.split(' ');
    let line = '';
    for (const word of words) {
      if ((line + ' ' + word).length > 70) {
        page.drawText(line.trim(), {
          x: 50,
          y: yPos,
          size: 10,
          font,
          color: rgb(0.3, 0.3, 0.3),
        });
        yPos -= 14;
        line = word;
      } else {
        line = line ? line + ' ' + word : word;
      }
    }

    if (line) {
      page.drawText(line.trim(), {
        x: 50,
        y: yPos,
        size: 10,
        font,
        color: rgb(0.3, 0.3, 0.3),
      });
      yPos -= 22;
    }
  }

  const pdfBytes = await pdfDoc.save();
  const filePath = path.join(__dirname, '..', filename);
  fs.writeFileSync(filePath, pdfBytes);
  console.log(`Created PDF contract: ${filePath}`);
}

async function createDocxContract(filename, title, sections) {
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            text: title,
            heading: HeadingLevel.HEADING_1,
          }),
          ...sections.flatMap((sec) => [
            new Paragraph({
              text: sec.heading,
              heading: HeadingLevel.HEADING_2,
            }),
            new Paragraph({
              children: [new TextRun(sec.text)],
            }),
          ]),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const filePath = path.join(__dirname, '..', filename);
  fs.writeFileSync(filePath, buffer);
  console.log(`Created DOCX contract: ${filePath}`);
}

async function generateAll() {
  const v1Sections = [
    {
      heading: 'Section 1. Ownership & Equity Control',
      text: 'Person A holds 100% of equity shares and executive control of the Company as of the Effective Date.',
    },
    {
      heading: 'Section 2. Payment Terms & Billing Cycle',
      text: 'Client shall pay all undisputed invoices within 30 days of receipt of invoice from Service Provider.',
    },
    {
      heading: 'Section 3. Limitation of Liability',
      text: 'The maximum aggregate liability of Service Provider under this Agreement shall not exceed AED 100,000.',
    },
    {
      heading: 'Section 4. Termination for Convenience',
      text: 'Either party may terminate this Agreement at any time upon providing 30 days prior written notice.',
    },
    {
      heading: 'Section 5. Governing Law',
      text: 'This Agreement shall be governed by and construed in accordance with the laws of the United Arab Emirates.',
    },
  ];

  const v2Sections = [
    {
      heading: 'Section 1. Ownership & Equity Control',
      text: 'Person A holds 100% of equity shares and executive control of the Company as of the Effective Date.',
    },
    {
      heading: 'Section 2. Payment Terms & Billing Cycle',
      text: 'Client shall pay all undisputed invoices within 15 days of receipt of invoice from Service Provider.',
    },
    {
      heading: 'Section 3. Limitation of Liability',
      text: 'The maximum aggregate liability of Service Provider under this Agreement shall not exceed AED 1,000,000.',
    },
    {
      heading: 'Section 4. Termination for Convenience',
      text: 'Either party may terminate this Agreement at any time upon providing 60 days prior written notice.',
    },
    {
      heading: 'Section 5. Governing Law & Dispute Resolution',
      text: 'This Agreement shall be governed by the laws of the United Arab Emirates. All disputes shall be settled by arbitration in Dubai International Arbitration Centre.',
    },
  ];

  await createPdfContract('sample_contract_v1.pdf', 'Master Services Agreement (v1.0)', v1Sections);
  await createPdfContract('sample_contract_v2.pdf', 'Master Services Agreement (v2.0)', v2Sections);
  await createDocxContract('sample_contract.docx', 'Master Services Agreement (Word)', v1Sections);
}

generateAll().catch(console.error);
