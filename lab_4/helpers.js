import axios from "axios";
import dotenv from "dotenv";

dotenv.config({path: "../.env"});

export const envs = {
    DOMAIN: process.env.DOMAIN,
    CLIENT_ID: process.env.CLIENT_ID,
    CLIENT_SECRET: process.env.CLIENT_SECRET,
    AUDIENCE: process.env.AUDIENCE,
    EMAIL: process.env.EMAIL,
    PASSWORD: process.env.PASSWORD,
};

// Password grant login
export async function loginWithPassword(email, password) {
    const url = `https://${envs.DOMAIN}/oauth/token`;
    const payload = new URLSearchParams({
        grant_type: "password",
        username: email,
        password: password,
        client_id: envs.CLIENT_ID,
        client_secret: envs.CLIENT_SECRET,
        scope: "openid profile email offline_access",
        connection: "my-database",
    });

    try {
        const res = await axios.post(url, payload.toString(), {
            headers: {"Content-Type": "application/x-www-form-urlencoded"},
        });
        console.log("Auth0 response:", res.data);
        return res.data;
    } catch (e) {
        console.error("Auth0 login failed");
        if (e.response) {
            console.error("Status:", e.response.status);
            console.error("Headers:", e.response.headers);
            console.error("Data:", e.response.data); //
        } else {
            console.error("Error message:", e.message);
        }
        throw e;
    }
}

//  Management API token
export async function getManagementToken() {
    const url = `https://${envs.DOMAIN}/oauth/token`;
    const payload = {
        client_id: envs.CLIENT_ID,
        client_secret: envs.CLIENT_SECRET,
        audience: envs.AUDIENCE,
        grant_type: "client_credentials",
    };
    const res = await axios.post(url, payload, {
        headers: {"Content-Type": "application/json"},
    });
    console.log("Management API token:", res.data.access_token);
    return res.data;
}

// Create new user
export async function createUser(email, password) {
    const tokenData = await getManagementToken();
    const mgmtToken = tokenData.access_token;
    const url = `https://${envs.DOMAIN}/api/v2/users`;
    const payload = {
        email,
        password,
        connection: "my-database",
        email_verified: false,
    };
    const res = await axios.post(url, payload, {
        headers: {Authorization: `Bearer ${mgmtToken}`, "Content-Type": "application/json"},
    });
    console.log("User created:", res.data);
    return res.data;
}

// Refresh access token
export async function getRefreshToken(code) {
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
