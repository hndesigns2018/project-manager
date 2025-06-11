// ✅ Clean server.js without Carpenter and Electrician modules

const { Pool } = require('pg');

const express = require('express');
const app = express();
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');


const PORT = process.env.PORT || 3000;



// Serve static files from frontend folder
app.use(express.static(path.join(__dirname, 'public')));

// Homepage route - open project.html by default
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});


app.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
});


app.use(cors());
app.use(bodyParser.json());

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'project_manager',
  password: 'Hopun2327*',
  port: 5432,
});

// ==================== PROJECT ROUTES ====================

app.get('/projects', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM projects ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error fetching projects:', err.message);
    res.status(500).send('Database Error');
  }
});

app.post('/projects', async (req, res) => {
  const { name, location, start_date, end_date } = req.body;
  try {
    await pool.query(
      'INSERT INTO projects (name, location, start_date, end_date) VALUES ($1, $2, $3, $4)',
      [name, location, start_date, end_date]
    );
    res.status(201).send('Project added');
  } catch (err) {
    console.error('❌ Error inserting project:', err.message);
    res.status(500).send('Database Insert Error');
  }
});

app.delete('/projects/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM projects WHERE id = $1', [id]);
    if (result.rowCount === 0) return res.status(404).send('Not found');
    res.send('Deleted');
  } catch (err) {
    console.error('❌ Delete error:', err.message);
    res.status(500).send('Delete failed');
  }
});


// ==================== CONSULTANCY ROUTES ====================

app.post('/consultancy', async (req, res) => {
  const {
    project_id, client_name, location, description,
    rate_per_sqft, area_total, total_amount,
    gst, total_after_gst, paid, balance, remarks, gst_enabled
  } = req.body;

  try {
    const existing = await pool.query('SELECT id FROM consultancy_fees WHERE project_id = $1', [project_id]);
    if (existing.rows.length > 0) {
      const id = existing.rows[0].id;
      await pool.query(`UPDATE consultancy_fees SET
        client_name=$1, location=$2, description=$3, rate_per_sqft=$4,
        area_total=$5, total_amount=$6, gst=$7, total_after_gst=$8,
        paid=$9, balance=$10, remarks=$11, gst_enabled=$12
        WHERE id=$13`,
        [client_name, location, description, rate_per_sqft, area_total,
         total_amount, gst, total_after_gst, paid, balance, remarks, gst_enabled, id]);
      res.send("Updated");
    } else {
      await pool.query(`INSERT INTO consultancy_fees
        (project_id, client_name, location, description, rate_per_sqft, area_total,
        total_amount, gst, total_after_gst, paid, balance, remarks, gst_enabled)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [project_id, client_name, location, description, rate_per_sqft, area_total,
         total_amount, gst, total_after_gst, paid, balance, remarks, gst_enabled]);
      res.status(201).send("Created");
    }
  } catch (err) {
    console.error("❌ Consultancy error:", err.message);
    res.status(500).send("Consultancy insert/update failed");
  }
});
app.put('/consultancy/:id', async (req, res) => {
  const {
    client_name, location, description,
    rate_per_sqft, area_total, total_amount,
    gst, total_after_gst, paid, balance, remarks, gst_enabled
  } = req.body;

  const consultancyId = req.params.id;

  try {
    await pool.query(
      `UPDATE consultancy_fees
       SET client_name=$1, location=$2, description=$3,
           rate_per_sqft=$4, area_total=$5, total_amount=$6,
           gst=$7, total_after_gst=$8, paid=$9, balance=$10,
           remarks=$11, gst_enabled=$12
       WHERE id = $13`,
      [
        client_name, location, description,
        rate_per_sqft, area_total, total_amount,
        gst, total_after_gst, paid, balance,
        remarks, gst_enabled, consultancyId
      ]
    );
    res.send("✅ Consultancy updated");
  } catch (err) {
    console.error("❌ Consultancy update error:", err.message);
    res.status(500).send("Update failed");
  }
});


app.get('/consultancy/:projectId', async (req, res) => {
  const { projectId } = req.params;
  try {
    const result = await pool.query('SELECT * FROM consultancy_fees WHERE project_id = $1 ORDER BY created_at DESC', [projectId]);
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error fetching consultancy:', err.message);
    res.status(500).send('Consultancy fetch error');
  }
});

// ==================== CONSULTANCY PAYMENTS ====================

app.get('/payments/:project_id', async (req, res) => {
  const { project_id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM consultancy_payments WHERE project_id = $1 ORDER BY date ASC', [project_id]);
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Payment fetch failed:", err.message);
    res.status(500).send("Payment fetch error");
  }
});

app.post('/payments', async (req, res) => {
  const { project_id, payments } = req.body;

  if (!Array.isArray(payments)) {
    return res.status(400).send("Invalid data format");
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
	await client.query(`DELETE FROM estimator_items WHERE room_id IN (SELECT id FROM estimator_rooms WHERE project_id = $1)`, [project_id]);
    await client.query(`DELETE FROM estimator_rooms WHERE project_id = $1`, [project_id]);


    // 🧹 Delete old payments before inserting new ones
    await client.query('DELETE FROM consultancy_payments WHERE project_id = $1', [project_id]);

    for (const p of payments) {
      const { amount, date, remarks } = p;
      await client.query(
        `INSERT INTO consultancy_payments (project_id, amount, date, remarks)
         VALUES ($1, $2, $3, $4)`,
        [project_id, amount, date, remarks]
      );
    }

    await client.query('COMMIT');
    res.status(201).send("✅ Payments saved");
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("❌ Error saving payments:", err.message);
    res.status(500).send("Insert error");
  } finally {
    client.release();
  }
});

 app.delete('/payments/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM consultancy_payments WHERE id = $1', [id]);
    res.send("🗑️ Deleted successfully");
  } catch (err) {
    console.error("❌ Error deleting payment:", err.message);
    res.status(500).send("Delete failed");
  }
});

// ==================== CARPENTER PAYMENTS ====================


// === INSERT OR UPDATE CARPENTER DETAILS ===
app.post('/carpenter', async (req, res) => {
  const {
    project_id,
    carpenter_name,
    total,
    paid,
    balance,
    remarks
  } = req.body;

  try {
    const check = await pool.query(
      'SELECT id FROM carpenter_details WHERE project_id = $1',
      [project_id]
    );

    if (check.rows.length > 0) {
      await pool.query(
        `UPDATE carpenter_details
         SET carpenter_name = $2, total = $3, paid = $4, balance = $5, remarks = $6
         WHERE project_id = $1`,
        [project_id, carpenter_name, total, paid, balance, remarks]
      );
    } else {
      await pool.query(
        `INSERT INTO carpenter_details 
         (project_id, carpenter_name, total, paid, balance, remarks)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [project_id, carpenter_name, total, paid, balance, remarks]
      );
    }

    res.status(200).send("✅ Carpenter saved");
  } catch (err) {
    console.error("❌ Error saving carpenter:", err.message);
    res.status(500).send("Error");
  }
});

// === SAVE PAYMENTS FOR CARPENTER ===
app.post('/carpenter-payments', async (req, res) => {
  const { project_id, payments } = req.body;

  if (!Array.isArray(payments)) {
    return res.status(400).send("Invalid data");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Delete existing payments for this project
    await client.query("DELETE FROM carpenter_payments WHERE project_id = $1", [project_id]);

    // Insert new payments
    for (const pay of payments) {
      const { amount, date, remarks } = pay;
      await client.query(
        `INSERT INTO carpenter_payments (project_id, amount, date, remarks)
         VALUES ($1, $2, $3, $4)`,
        [project_id, amount, date, remarks]
      );
    }

    // Recalculate paid and balance
    const totalPaid = payments.reduce((acc, p) => acc + parseFloat(p.amount || 0), 0);
    const result = await client.query(
      'SELECT total FROM carpenter_details WHERE project_id = $1',
      [project_id]
    );
    const total = result.rows[0]?.total || 0;
    const balance = total - totalPaid;

    // Update totals in carpenter_details
    await client.query(
      `UPDATE carpenter_details SET paid = $1, balance = $2 WHERE project_id = $3`,
      [totalPaid, balance, project_id]
    );

    await client.query("COMMIT");
    res.status(201).send("✅ Carpenter payments saved");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Error in carpenter-payments:", err.message);
    res.status(500).send("Error saving payments");
  } finally {
    client.release();
  }
});

// === FETCH PAYMENTS ===
app.get('/carpenter-payments/:project_id', async (req, res) => {
  const { project_id } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM carpenter_payments WHERE project_id = $1 ORDER BY date ASC`,
      [project_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching carpenter payments:", err.message);
    res.status(500).send("Error");
  }
});

// === FETCH CARPENTER DETAILS ===
app.get('/carpenter/:project_id', async (req, res) => {
  const { project_id } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM carpenter_details WHERE project_id = $1`,
      [project_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching carpenter:", err.message);
    res.status(500).send("Error");
  }
});

app.post('/electrician', async (req, res) => {
  const { project_id, electrician_name, total, paid, balance, remarks } = req.body;

  try {
    const existing = await pool.query(`SELECT * FROM electrician_details WHERE project_id = $1`, [project_id]);

    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE electrician_details
         SET electrician_name = $2, total = $3, paid = $4, balance = $5, remarks = $6
         WHERE project_id = $1`,
        [project_id, electrician_name, total, paid, balance, remarks]
      );
    } else {
      await pool.query(
        `INSERT INTO electrician_details 
         (project_id, electrician_name, total, paid, balance, remarks)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [project_id, electrician_name, total, paid, balance, remarks]
      );
    }

    res.status(200).send("✅ Electrician data saved");
  } catch (err) {
    console.error("❌ Error saving electrician data:", err.message);
    res.status(500).send("Insert/update error");
  }
});

app.get('/electrician/:project_id', async (req, res) => {
  const { project_id } = req.params;
  try {
    const electricianRes = await pool.query(
      `SELECT * FROM electrician_details WHERE project_id = $1`,
      [project_id]
    );

    if (electricianRes.rows.length === 0) {
      return res.json([]);
    }

    const elec = electricianRes.rows[0];

    // 🔢 Calculate paid and balance
    const paidRes = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total_paid FROM electrician_payments WHERE project_id = $1`,
      [project_id]
    );

    const paid = parseFloat(paidRes.rows[0].total_paid) || 0;
    const balance = parseFloat(elec.total || 0) - paid;

    res.json([{
      ...elec,
      paid,
      balance
    }]);
  } catch (err) {
    console.error("❌ Error fetching electrician details:", err.message);
    res.status(500).send("Server Error");
  }
});


app.post('/electrician-payments', async (req, res) => {
  const { project_id, payments } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM electrician_payments WHERE project_id = $1', [project_id]);

    for (const p of payments) {
      const { amount, date, remarks } = p;
      await client.query(
        `INSERT INTO electrician_payments (project_id, amount, date, remarks)
         VALUES ($1, $2, $3, $4)`,
        [project_id, amount, date, remarks]
      );
    }

    const paid = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    const totalRes = await client.query(`SELECT total FROM electrician_details WHERE project_id = $1`, [project_id]);
    const total = totalRes.rows.length > 0 ? parseFloat(totalRes.rows[0].total) : 0;
    const balance = total - paid;

    await client.query(
      `UPDATE electrician_details SET paid = $1, balance = $2 WHERE project_id = $3`,
      [paid, balance, project_id]
    );

    await client.query('COMMIT');
    res.status(201).send("✅ Electrician payments updated");
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("❌ Error saving electrician payments:", err.message);
    res.status(500).send("Insert error");
  } finally {
    client.release();
  }
});

app.get('/electrician-payments/:project_id', async (req, res) => {
  const { project_id } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM electrician_payments WHERE project_id = $1 ORDER BY date ASC`,
      [project_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching electrician payments:", err.message);
    res.status(500).send("Read error");
  }
});

// ----------------- FALSE CEILING ----------------------

// ================= FALSE CEILING ROUTES =================

// === FALSE CEILING MODULE ONLY ===

app.post('/falseceiling', async (req, res) => {
  const { project_id, name, total, paid, balance, remarks } = req.body;

  try {
    const check = await pool.query(
      'SELECT id FROM false_ceiling_details WHERE project_id = $1',
      [project_id]
    );

    if (check.rows.length > 0) {
      await pool.query(
        `UPDATE false_ceiling_details
         SET name = $2, total = $3, paid = $4, balance = $5, remarks = $6
         WHERE project_id = $1`,
        [project_id, name, total, paid, balance, remarks]
      );
    } else {
      await pool.query(
        `INSERT INTO false_ceiling_details
         (project_id, name, total, paid, balance, remarks)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [project_id, name, total, paid, balance, remarks]
      );
    }

    res.status(200).send("✅ False ceiling details saved");
  } catch (err) {
    console.error("❌ Error saving false ceiling details:", err.message);
    res.status(500).send("Error saving data");
  }
});

app.get('/falseceiling', async (req, res) => {
  const { project_id } = req.query;
  try {
    const result = await pool.query(
      `SELECT * FROM false_ceiling_details WHERE project_id = $1`,
      [project_id]
    );
    res.json(result.rows[0] || null);
  } catch (err) {
    console.error("❌ Error fetching false ceiling details:", err.message);
    res.status(500).send("Fetch error");
  }
});

app.get('/paymentceiling', async (req, res) => {
  const { project_id } = req.query;
  try {
    const result = await pool.query(
      `SELECT * FROM false_ceiling_payments WHERE project_id = $1 ORDER BY date ASC`,
      [project_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching ceiling payments:", err.message);
    res.status(500).send("Payment fetch error");
  }
});

app.post('/paymentceiling', async (req, res) => {
  const { project_id, payments } = req.body;

  if (!project_id || !Array.isArray(payments)) {
    return res.status(400).send("Invalid request");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `DELETE FROM false_ceiling_payments WHERE project_id = $1`,
      [project_id]
    );

    for (const p of payments) {
      const { amount, date, details, remarks } = p;
      await client.query(
        `INSERT INTO false_ceiling_payments
         (project_id, amount, date, details, remarks)
         VALUES ($1, $2, $3, $4, $5)`,
        [project_id, amount, date, details, remarks]
      );
    }

    const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    const totalRes = await client.query(
      `SELECT total FROM false_ceiling_details WHERE project_id = $1`,
      [project_id]
    );
    const total = totalRes.rows.length > 0 ? parseFloat(totalRes.rows[0].total) : 0;
    const balance = total - totalPaid;

    await client.query(
      `UPDATE false_ceiling_details SET paid = $1, balance = $2 WHERE project_id = $3`,
      [totalPaid, balance, project_id]
    );

    await client.query("COMMIT");
    res.status(200).send("✅ Payments saved");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Error saving payments:", err.message);
    res.status(500).send("Insert error");
  } finally {
    client.release();
  }
});

// ======================= PAINTER DETAILS =======================
// =================== Painter Details ===================
app.get('/painter', async (req, res) => {
  const { project_id } = req.query;
  try {
    const result = await pool.query(
      'SELECT * FROM painter_details WHERE project_id = $1',
      [project_id]
    );
    res.json(result.rows[0] || {});
  } catch (err) {
    console.error('❌ Error fetching painter details:', err);
    res.status(500).send('Error fetching painter details');
  }
});

app.post('/painter', async (req, res) => {
  const { project_id, painter_name, total, paid, balance, remarks } = req.body;
  try {
    const existing = await pool.query(
      'SELECT * FROM painter_details WHERE project_id = $1',
      [project_id]
    );

    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE painter_details
         SET painter_name = $2, total = $3, paid = $4, balance = $5, remarks = $6
         WHERE project_id = $1`,
        [project_id, painter_name, total, paid, balance, remarks]
      );
    } else {
      await pool.query(
        `INSERT INTO painter_details
         (project_id, painter_name, total, paid, balance, remarks)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [project_id, painter_name, total, paid, balance, remarks]
      );
    }

    res.send('✅ Painter details saved');
  } catch (err) {
    console.error('❌ Error saving painter details:', err);
    res.status(500).send('Error saving painter details');
  }
});

// =================== Painter Payments ===================
app.get('/painter-payments/:project_id', async (req, res) => {
  const { project_id } = req.params;
  try {
    const result = await pool.query(
      'SELECT * FROM painter_payments WHERE project_id = $1 ORDER BY date ASC',
      [project_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error fetching painter payments:', err);
    res.status(500).send('Error fetching painter payments');
  }
});

app.post('/painter-payments', async (req, res) => {
  const { project_id, payments } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Delete old entries
    await client.query('DELETE FROM painter_payments WHERE project_id = $1', [project_id]);

    // Insert new payments if available
    let paid = 0;

    if (payments.length > 0) {
      for (const pay of payments) {
        const { amount, date, remarks } = pay;
        await client.query(
          `INSERT INTO painter_payments (project_id, amount, date, remarks)
           VALUES ($1, $2, $3, $4)`,
          [project_id, amount, date, remarks]
        );
      }

      paid = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    }

    // Fetch total
    const totalRes = await client.query(
      'SELECT total FROM painter_details WHERE project_id = $1',
      [project_id]
    );
    const total = totalRes.rows.length > 0 ? parseFloat(totalRes.rows[0].total) : 0;
    const balance = total - paid;

    // Update paid & balance in painter_details
    await client.query(
      'UPDATE painter_details SET paid = $1, balance = $2 WHERE project_id = $3',
      [paid, balance, project_id]
    );

    await client.query('COMMIT');
    res.status(201).send("✅ Painter payments saved");
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("❌ Error in painter-payments:", err.message);
    res.status(500).send("Error saving payments");
  } finally {
    client.release();
  }
});

// 🧱 FABRICATION DETAILS

app.post("/fabrication", async (req, res) => {
  const client = await pool.connect();
  try {
    const { project_id, fabricator_name, total, paid, balance, remarks } = req.body;
    await client.query(`
      INSERT INTO fabrication_details (project_id, fabricator_name, total, paid, balance, remarks)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (project_id) DO UPDATE SET
        fabricator_name = EXCLUDED.fabricator_name,
        total = EXCLUDED.total,
        paid = EXCLUDED.paid,
        balance = EXCLUDED.balance,
        remarks = EXCLUDED.remarks
    `, [project_id, fabricator_name, total, paid, balance, remarks]);
    res.status(200).send("Fabrication details saved.");
  } catch (err) {
    console.error("❌ Error saving fabrication details:", err);
    res.status(500).send("Error saving fabrication details.");
  } finally {
    client.release();
  }
});

app.get("/fabrication/:project_id", async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query("SELECT * FROM fabrication_details WHERE project_id = $1", [req.params.project_id]);
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching fabrication details:", err);
    res.status(500).send("Error fetching fabrication details.");
  } finally {
    client.release();
  }
});

// 💸 FABRICATION PAYMENTS

app.post("/paymentfabric", async (req, res) => {
  const client = await pool.connect();
  try {
    const { project_id, payments } = req.body;

    // 🧹 Delete old payments
    await client.query("DELETE FROM fabrication_payments WHERE project_id = $1", [project_id]);

    let paid = 0;

    if (payments.length > 0) {
      for (const pay of payments) {
        const { amount, date, details, remarks } = pay;
        await client.query(`
          INSERT INTO fabrication_payments (project_id, amount, date, details, remarks)
          VALUES ($1, $2, $3, $4, $5)
        `, [project_id, amount, date, details, remarks]);
      }

      paid = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    }

    const totalRes = await client.query("SELECT total FROM fabrication_details WHERE project_id = $1", [project_id]);
    const total = totalRes.rows.length > 0 ? parseFloat(totalRes.rows[0].total) : 0;
    const balance = total - paid;

    await client.query(`
      UPDATE fabrication_details SET paid = $1, balance = $2 WHERE project_id = $3
    `, [paid, balance, project_id]);

    res.status(200).send("Fabrication payments updated.");
  } catch (err) {
    console.error("❌ Error saving fabrication payments:", err);
    res.status(500).send("Error saving fabrication payments.");
  } finally {
    client.release();
  }
});

app.get("/fabrication-payments/:project_id", async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query("SELECT * FROM fabrication_payments WHERE project_id = $1", [req.params.project_id]);
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching fabrication payments:", err);
    res.status(500).send("Error fetching fabrication payments.");
  } finally {
    client.release();
  }
});

// 🔷 TILES & GRANITE DETAILS

app.post("/tilesgranite", async (req, res) => {
  const client = await pool.connect();
  try {
    const { project_id, contractor_name, total, paid, balance, remarks } = req.body;

    await client.query(`
      INSERT INTO tiles_granite_details (project_id, contractor_name, total, paid, balance, remarks)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (project_id) DO UPDATE SET
        contractor_name = EXCLUDED.contractor_name,
        total = EXCLUDED.total,
        paid = EXCLUDED.paid,
        balance = EXCLUDED.balance,
        remarks = EXCLUDED.remarks
    `, [project_id, contractor_name, total, paid, balance, remarks]);

    res.status(200).send("Tiles & Granite details saved.");
  } catch (err) {
    console.error("❌ Error saving tiles details:", err);
    res.status(500).send("Error saving tiles details.");
  } finally {
    client.release();
  }
});

app.get("/tilesgranite/:project_id", async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      "SELECT * FROM tiles_granite_details WHERE project_id = $1",
      [req.params.project_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching tiles details:", err);
    res.status(500).send("Error fetching tiles details.");
  } finally {
    client.release();
  }
});

// 💰 TILES & GRANITE PAYMENTS

app.post("/paymenttiles", async (req, res) => {
  const client = await pool.connect();
  try {
    const { project_id, payments } = req.body;

    // Clean old payments
    await client.query("DELETE FROM tiles_granite_payments WHERE project_id = $1", [project_id]);

    let paid = 0;

    for (const pay of payments) {
      const { amount, date, details, remarks } = pay;
      await client.query(`
        INSERT INTO tiles_granite_payments (project_id, amount, date, details, remarks)
        VALUES ($1, $2, $3, $4, $5)
      `, [project_id, amount, date, details, remarks]);
    }

    paid = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

    const totalRes = await client.query(
      "SELECT total FROM tiles_granite_details WHERE project_id = $1",
      [project_id]
    );
    const total = totalRes.rows.length > 0 ? parseFloat(totalRes.rows[0].total) : 0;
    const balance = total - paid;

    await client.query(
      "UPDATE tiles_granite_details SET paid = $1, balance = $2 WHERE project_id = $3",
      [paid, balance, project_id]
    );

    res.status(200).send("Tiles & Granite payments saved.");
  } catch (err) {
    console.error("❌ Error saving tiles payments:", err);
    res.status(500).send("Error saving tiles payments.");
  } finally {
    client.release();
  }
});

app.get("/tilesgranite-payments/:project_id", async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      "SELECT * FROM tiles_granite_payments WHERE project_id = $1",
      [req.params.project_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching tiles payments:", err);
    res.status(500).send("Error fetching tiles payments.");
  } finally {
    client.release();
  }
});

// 🔧 PLUMBER DETAILS

app.post("/plumber", async (req, res) => {
  const client = await pool.connect();
  try {
    const { project_id, contractor_name, total, paid, balance, remarks } = req.body;

    await client.query(`
      INSERT INTO plumber_details (project_id, contractor_name, total, paid, balance, remarks)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (project_id) DO UPDATE SET
        contractor_name = EXCLUDED.contractor_name,
        total = EXCLUDED.total,
        paid = EXCLUDED.paid,
        balance = EXCLUDED.balance,
        remarks = EXCLUDED.remarks
    `, [project_id, contractor_name, total, paid, balance, remarks]);

    res.status(200).send("Plumber details saved.");
  } catch (err) {
    console.error("❌ Error saving plumber details:", err);
    res.status(500).send("Error saving plumber details.");
  } finally {
    client.release();
  }
});

app.get("/plumber/:project_id", async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      "SELECT * FROM plumber_details WHERE project_id = $1",
      [req.params.project_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching plumber details:", err);
    res.status(500).send("Error fetching plumber details.");
  } finally {
    client.release();
  }
});

// 💰 PLUMBER PAYMENTS

app.post("/paymentplumber", async (req, res) => {
  const client = await pool.connect();
  try {
    const { project_id, payments } = req.body;

    await client.query("DELETE FROM plumber_payments WHERE project_id = $1", [project_id]);

    let paid = 0;
    for (const pay of payments) {
      const { amount, date, details, remarks } = pay;
      await client.query(`
        INSERT INTO plumber_payments (project_id, amount, date, details, remarks)
        VALUES ($1, $2, $3, $4, $5)
      `, [project_id, amount, date, details, remarks]);
    }

    paid = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

    const totalRes = await client.query(
      "SELECT total FROM plumber_details WHERE project_id = $1",
      [project_id]
    );
    const total = totalRes.rows.length > 0 ? parseFloat(totalRes.rows[0].total) : 0;
    const balance = total - paid;

    await client.query(`
      UPDATE plumber_details SET paid = $1, balance = $2 WHERE project_id = $3
    `, [paid, balance, project_id]);

    res.status(200).send("Plumber payments saved.");
  } catch (err) {
    console.error("❌ Error saving plumber payments:", err);
    res.status(500).send("Error saving plumber payments.");
  } finally {
    client.release();
  }
});

app.get("/plumber-payments/:project_id", async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      "SELECT * FROM plumber_payments WHERE project_id = $1",
      [req.params.project_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching plumber payments:", err);
    res.status(500).send("Error fetching plumber payments.");
  } finally {
    client.release();
  }
});


app.post('/estimator', async (req, res) => {
  const client = await pool.connect();
  try {
    const { project_id, rooms } = req.body;

    if (!project_id || !Array.isArray(rooms)) {
  return res.status(400).json({ message: 'Invalid input' });
}
if (rooms.length === 0) {
  console.log("⚠️ All rooms were deleted — clearing estimator data");
}

    await client.query('BEGIN');

    // ✅ Step 1: Delete old records
    const oldRooms = await client.query(
      `SELECT id FROM estimator_rooms WHERE project_id = $1`,
      [project_id]
    );

    for (const room of oldRooms.rows) {
      await client.query(
        `DELETE FROM estimator_items WHERE room_id = $1`,
        [room.id]
      );
    }

    await client.query(
      `DELETE FROM estimator_rooms WHERE project_id = $1`,
      [project_id]
    );

    // ✅ Step 2: Insert new records
    for (const room of rooms) {
      const insertRoomQuery = `
        INSERT INTO estimator_rooms (project_id, room_name, total)
        VALUES ($1, $2, $3)
        RETURNING id
      `;
      const roomResult = await client.query(insertRoomQuery, [
        project_id,
        room.room_name,
        room.total
      ]);

      const roomId = roomResult.rows[0].id;

      for (const item of room.items) {
        const insertItemQuery = `
          INSERT INTO estimator_items
          (room_id, item, length_ft, length_in, height_ft, height_in, area, rate, amount)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `;
        await client.query(insertItemQuery, [
          roomId,
          item.item,
          item.length_ft,
          item.length_in,
          item.height_ft,
          item.height_in,
          item.area,
          item.rate,
          item.amount
        ]);
      }
    }

    await client.query('COMMIT');
    res.json({ message: 'Rooms and items saved successfully ✅' });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error saving estimator data:', err.message);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

app.get('/estimator/:project_id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { project_id } = req.params;

    // Step 1: Fetch all rooms
    const roomResult = await client.query(
      `SELECT id, room_name, total FROM estimator_rooms WHERE project_id = $1`,
      [project_id]
    );

    const rooms = [];

    for (const room of roomResult.rows) {
      const itemResult = await client.query(
        `SELECT item, length_ft, length_in, height_ft, height_in, area, rate, amount
         FROM estimator_items WHERE room_id = $1`,
        [room.id]
      );

      rooms.push({
        room_name: room.room_name,
        total: parseFloat(room.total),
        items: itemResult.rows.map(row => ({
          item: row.item,
          length_ft: parseFloat(row.length_ft),
          length_in: parseFloat(row.length_in),
          height_ft: parseFloat(row.height_ft),
          height_in: parseFloat(row.height_in),
          area: parseFloat(row.area),
          rate: parseFloat(row.rate),
          amount: parseFloat(row.amount)
        }))
      });
    }

    res.json(rooms);
  } catch (err) {
    console.error("❌ Error fetching estimator data:", err.message);
    res.status(500).json({ message: "Fetch error" });
  } finally {
    client.release();
  }
});


// Default fallback error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack);
  res.status(500).send('Something broke!');
});




// ==================== START SERVER ====================


