import { Hono } from 'hono';
import { handle } from 'hono/cloudflare-pages';
import { jwt, sign } from 'hono/jwt';

// Define the bindings for Cloudflare Pages (D1, Env vars)
type Bindings = {
  DB: D1Database;
  JWT_SECRET: string;
};

const app = new Hono<{ Bindings: Bindings }>().basePath('/api');

// --- MIDDLEWARES ---
// We will apply JWT authentication to all routes except /auth/login and /auth/register
app.use('/patients/*', (c, next) => {
  const jwtMiddleware = jwt({
    secret: c.env.JWT_SECRET || 'fallback-secret-for-local-dev-only',
  });
  return jwtMiddleware(c, next);
});

app.use('/auth/me', (c, next) => {
  const jwtMiddleware = jwt({
    secret: c.env.JWT_SECRET || 'fallback-secret-for-local-dev-only',
  });
  return jwtMiddleware(c, next);
});

// --- ROUTES ---

app.get('/health', (c) => {
  return c.json({ status: 'ok', message: 'API is running on Cloudflare Edge!' });
});

// 1. AUTH ROUTES
app.post('/auth/login', async (c) => {
  try {
    const body = await c.req.json();
    const email = body.email;
    // const password = body.password; // Implement proper hashing (e.g., bcrypt/scrypt) in a real scenario
    
    if (!email) {
      return c.json({ error: 'Email is required' }, 400);
    }

    // In a real scenario, you'd fetch the user and verify the password hash here
    // For now, we mock the user based on the email provided to allow the frontend to continue working
    const mockUser = {
      id: 'mock-uuid-1234',
      email: email
    };

    const token = await sign(
      {
        id: mockUser.id,
        email: mockUser.email,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 // 24 hours
      },
      c.env.JWT_SECRET || 'fallback-secret-for-local-dev-only'
    );

    return c.json({ token, user: mockUser });
  } catch (err) {
    console.error(err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

app.get('/auth/me', async (c) => {
  const payload = c.get('jwtPayload');
  
  // Here we would typically fetch the full user profile and permissions from D1
  // Mocking the profile to match the frontend `UserProfile` interface
  const profile = {
    user_id: payload.id,
    role: 'admin',
    full_name: 'Admin User',
    email: payload.email,
    institution_id: null,
    institution_ids: [],
    permissions: [
      { resource: 'patients', action: 'manage', institution_id: null }
    ],
    allowed_routes: ['/dashboard', '/patients'],
    is_active: true
  };
  
  return c.json({ profile });
});

app.post('/auth/logout', async (c) => {
  // JWTs are stateless, so logout is handled by the client clearing the token.
  // We can just return success here.
  return c.json({ success: true });
});


// 2. PATIENTS ROUTES (CRUD)
app.post('/patients', async (c) => {
  // Example of how a standard fetch call from the frontend might query D1
  const payload = c.get('jwtPayload'); // Access the user payload from the JWT
  const body = await c.req.json();
  
  /*
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM patients WHERE institution_id = ?"
  ).bind(body.institution_id).all();
  return c.json({ data: results, error: null });
  */
  
  return c.json({ data: [], error: null, message: "Endpoint for patient listing" });
});

// 2. GENERIC ROUTES FOR MIGRATION
app.post('/*', async (c) => {
  const url = new URL(c.req.url);
  return c.json({ data: [], success: true, message: `Mocked generic POST for ${url.pathname}` });
});

app.get('/*', async (c) => {
  const url = new URL(c.req.url);
  return c.json({ data: [], success: true, message: `Mocked generic GET for ${url.pathname}` });
});

// We need to implement all other required routes that the frontend expects over time.

export const onRequest = handle(app);
