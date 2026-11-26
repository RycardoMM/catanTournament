const nodemailer = require('nodemailer');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { mensaje, imagen, ua } = req.body || {};
  if (!mensaje && !imagen) return res.status(400).json({ error: 'Sin contenido' });

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  const html = `
    <h2>💬 Nuevo feedback — CatanTorneo</h2>
    <p><strong>Mensaje:</strong></p>
    <p>${mensaje ? mensaje.replace(/\n/g, '<br>') : '<em>(sin texto)</em>'}</p>
    ${imagen ? `<p><strong>Captura:</strong></p><img src="${imagen}" style="max-width:600px;border-radius:8px">` : ''}
    <hr>
    <small>UA: ${ua || '-'}</small>
  `;

  await transporter.sendMail({
    from: `"CatanTorneo Feedback" <${process.env.GMAIL_USER}>`,
    to: process.env.GMAIL_USER,
    subject: '💬 Nuevo feedback - CatanTorneo',
    html,
  });

  res.status(200).json({ ok: true });
};
