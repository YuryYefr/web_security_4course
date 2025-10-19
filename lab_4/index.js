import express from "express";
import dotenv from "dotenv";
import path from "path";
import bodyParser from "body-parser";
import onFinished from "on-finished";
import {fileURLToPath} from "url";
import jwt from "jsonwebtoken";
import {loginWithPassword, envs, createUser, getManagementToken, getRefreshToken} from "./helpers.js";
import {Session} from "./session.js";

dotenv.config({path: '../.env'});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = 3000;
const SESSION_KEY = "Authorization";

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static(path.join(__dirname, "public")));

// ---- Session handling ----
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

// ---- Routes ----
app.get("/", (req, res) => {
    // handled by index.html frontend
    res.redirect("/auth");
});

app.get("/logout", (req, res) => {
    sessions.destroy(req);
    res.redirect("/");
});

// Example local users (demo only)
const users = [{login: "Login", password: "Password", username: "Username"}, {
    login: "Login1",
    password: "Password1",
    username: "Username1"
}, {login: envs.EMAIL, password: envs.PASSWORD, username: "Username1"},];

// Login endpoint
app.post("/api/login", (req, res) => {
    const {login, password} = req.body;
    const user = users.find((u) => u.login === login && u.password === password);

    if (user) {
        req.session.username = user.username;
        req.session.login = user.login;
        return res.json({username: user.username, token: req.sessionId});
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
        return res.json({username: passwordLogin.username, token: req.sessionId});
    }
    res.status(401).send();
})


app.get("/callback", async (req, res) => {
    const {code} = req.query;
    if (!code) return res.status(400).send("Missing code");

    try {
        // Exchange code for tokens
        const tokenData = await getRefreshToken(code);
        req.session.tokens = tokenData;

        // Decode the ID token to extract user info
        const decoded = jwt.decode(tokenData.id_token);

        // Create local session
        req.session.username = decoded.name || decoded.email || "Auth0User";
        req.session.email = decoded.email;
        req.session.sub = decoded.sub;

        // Redirect user to home
        //  extra grade user creation
        res.send(`
      <html lang="en">
        <body style="font-family:sans-serif;">
          <h1>✅ Auth0 Login Success!</h1>
          <p>Welcome, ${req.session.username}</p>
          <p><a href="/create-user">Create User via Auth0</a></p>   
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
    try {
        const response = await createUser(envs.EMAIL, envs.PASSWORD);
        res.json(response.data);
    } catch (err) {
        res.status(500).json(err.response?.data);
    }
});

// ---- Start server ----
app.listen(port, () => {
    console.log(`🚀 App running on http://127.0.0.1:${port}`);
});
