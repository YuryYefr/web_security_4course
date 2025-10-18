import express from "express";
import dotenv from "dotenv";
import axios from "axios";
import {v4 as uuid} from "uuid";
import fs from "fs";
import path from "path";
import bodyParser from "body-parser";
import onFinished from "on-finished";
import {fileURLToPath} from "url";
import jwt from "jsonwebtoken";
import {loginWithPassword, envs} from "./helpers.js";

dotenv.config({path: '../.env'});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = 3000;
const SESSION_KEY = "Authorization";

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// ---- Session handling ----
class Session {
  #sessions = {};

  constructor() {
    try {
      const data = fs.readFileSync("./sessions.json", "utf8");
      this.#sessions = JSON.parse(data.trim());
    } catch {
      this.#sessions = {};
    }
  }

  #storeSessions() {
    fs.writeFileSync("./sessions.json", JSON.stringify(this.#sessions, null, 2), "utf-8");
  }

  set(key, value = {}) {
    this.#sessions[key] = value;
    this.#storeSessions();
  }

  get(key) {
    return this.#sessions[key];
  }

  init() {
    const sessionId = uuid;
    this.set(sessionId);
    return sessionId;
  }

  destroy(req) {
    const sessionId = req.sessionId;
    delete this.#sessions[sessionId];
    this.#storeSessions();
  }
}

const sessions = new Session();

// ---- Middleware to manage sessions ----
app.use((req, res, next) => {
  let currentSession = {};
  let sessionId = req.get(SESSION_KEY);

  if (sessionId) {
    currentSession = sessions.get(sessionId);
    if (!currentSession) {
      currentSession = {};
      sessionId = sessions.init();
    }
  } else {
    sessionId = sessions.init();
  }

  req.session = currentSession;
  req.sessionId = sessionId;

  onFinished(req, () => {
    sessions.set(req.sessionId, req.session);
  });

  next();
});


// ---- Auth0 Helpers ----
async function getManagementToken() {
  const url = `https://${envs.DOMAIN}/oauth/token`;
  const payload = {
    client_id: envs.CLIENT_ID,
    client_secret: envs.CLIENT_SECRET,
    audience: envs.AUDIENCE,
    grant_type: "client_credentials",
  };
  const res = await axios.post(url, payload, {
    headers: { "Content-Type": "application/json" },
  });
  return res.data;
}

async function getRefreshToken(code) {
  const url = `https://${envs.DOMAIN}/oauth/token`;
  const payload = {
    client_id: envs.CLIENT_ID,
    client_secret: envs.CLIENT_SECRET,
    grant_type: "authorization_code",
    redirect_uri: "http://127.0.0.1:3000/callback",
    connection: "my-database",
    code,
  };
  const res = await axios.post(url, payload);
  return res.data;
}

// ---- Routes ----
app.get("/", (req, res) => {
  // handled by index.html frontend
  res.sendFile(path.join(__dirname, "public/index.html"));
});

app.get("/logout", (req, res) => {
  sessions.destroy(req);
  res.redirect("/");
});

// Example local users (demo only)
const users = [
  { login: "Login", password: "Password", username: "Username" },
  { login: "Login1", password: "Password1", username: "Username1" },
  { login: envs.EMAIL, password: envs.PASSWORD, username: "Username1" },
];

// Login endpoint
app.post("/api/login", (req, res) => {
  const { login, password } = req.body;
  const user = users.find(
    (u) => u.login === login && u.password === password
  );

  if (user) {
    req.session.username = user.username;
    req.session.login = user.login;
    return res.json({ username: user.username, token: req.sessionId });
  }

  res.status(401).send();
});

// Auth0 endpoints
app.get("/auth", (req, res) => {
  const authUrl = `https://${envs.DOMAIN}/authorize?response_type=code&client_id=${envs.CLIENT_ID}&redirect_uri=http://127.0.0.1:3000/callback&scope=offline_access%20openid%20profile%20email&state=xyz123`;
  res.redirect(authUrl);
});

app.get("/passwordLogin", async (req, res) => {
  const passwordLogin = await loginWithPassword(envs.EMAIL, envs.PASSWORD);
  if (passwordLogin) {
    req.session.username = passwordLogin.username;
    req.session.login = passwordLogin.login;
    return res.json({ username: passwordLogin.username, token: req.sessionId });
  }
  res.status(401).send();
    }
)


app.get("/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send("Missing code");

  try {
    // 1️⃣ Exchange code for tokens
    const tokenData = await getRefreshToken(code);
    req.session.tokens = tokenData;

    // Decode the ID token to extract user info
    const decoded = jwt.decode(tokenData.id_token);

    // Create local session
    req.session.username = decoded.name || decoded.email || "Auth0User";
    req.session.email = decoded.email;
    req.session.sub = decoded.sub;

    // 5️⃣ Redirect user to home
    res.send(`
      <html lang="en">
        <body style="font-family:sans-serif;">
          <h1>✅ Auth0 Login Success!</h1>
          <p>Welcome, ${req.session.username}</p>
<!--          <script>-->
<!--            setTimeout(() => window.location.href = "/", 1500);-->
<!--          </script>-->
        </body>
      </html>
    `);
  } catch (err) {
    console.error("Auth0 callback error:", err.response?.data || err.message);
    res.status(500).send("Token exchange failed");
  }
});


app.get("/token", async (req, res) => {
  try {
    const tokenData = await getManagementToken();
    req.session.mgmt_token = tokenData.access_token;
    res.json(tokenData);
  } catch (err) {
    res.status(500).send("Could not retrieve management token");
  }
});

app.get("/create-user", async (req, res) => {
  if (!req.session.mgmt_token)
    return res.status(401).send("No management token found. Visit /token first.");

  const domain = envs.DOMAIN;
  const url = `https://${domain}/api/v2/users`;
  const userPayload = {
    email: envs.EMAIL,
    password: envs.PASSWORD,
    // connection: "Username-Password-Authentication",
    connection: "my-database",
    email_verified: false,
  };

  try {
    const response = await axios.post(url, userPayload, {
      headers: {
        Authorization: `Bearer ${req.session.mgmt_token}`,
        "Content-Type": "application/json",
      },
    });
    res.json(response.data);
  } catch (err) {
    res.status(500).json(err.response?.data);
  }
});

// ---- Start server ----
app.listen(port, () => {
  console.log(`🚀 App running on http://127.0.0.1:${port}`);
});
