const express = require('express');
const { createClient } = require('redis');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

// Redis client
const redis = createClient({ url: process.env.REDIS_URL });
redis.on('error', (err) => console.log('Redis Client Error', err));

// PostgreSQL pool
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Connect to Redis
redis.connect().catch(console.error);

// Middleware
app.use(express.json());

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Check Redis
    await redis.ping();

    // Check PostgreSQL
    await pool.query('SELECT 1');

    res.json({
      status: 'healthy',
      redis: 'connected',
      postgres: 'connected',
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
    });
  }
});

// Example endpoint with caching
app.get('/data/:id', async (req, res) => {
  const { id } = req.params;

  // Try cache first
  const cached = await redis.get(`data:${id}`);
  if (cached) {
    return res.json({ data: JSON.parse(cached), source: 'cache' });
  }

  // Fetch from database
  const result = await pool.query('SELECT * FROM items WHERE id = $1', [id]);

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Not found' });
  }

  // Cache for 5 minutes
  await redis.setEx(`data:${id}`, 300, JSON.stringify(result.rows[0]));

  res.json({ data: result.rows[0], source: 'database' });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Multi-container app is running',
    endpoints: ['/health', '/data/:id'],
  });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
