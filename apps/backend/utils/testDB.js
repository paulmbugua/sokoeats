import pool from '../config/db.js';

const testConnection = async () => {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Database Connection Successful:', result.rows);
  } catch (error) {
    console.error('❌ Database Connection Failed:', error.message);
  } finally {
    pool.end();
  }
};

testConnection();
