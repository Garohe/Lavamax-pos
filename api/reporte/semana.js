const { getSQL } = require('../../lib/db');
const { withAuth } = require('../../lib/auth');

module.exports = withAuth(async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const sql = getSQL();
  const dias = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dias.push(d.toLocaleDateString('sv-SE', { timeZone: 'America/Mexico_City' }));
  }

  const resultado = [];
  for (const dia of dias) {
    const rows = await sql`SELECT * FROM tickets WHERE substring(fecha from 1 for 10) = ${dia}`;
    if (rows.length > 0) {
      resultado.push({
        dia,
        tickets: rows.length,
        ventas: rows.reduce((s, t) => s + Number(t.total), 0),
      });
    }
  }

  res.json(resultado.reverse());
});
