import axios from "axios";
import dotenv from "dotenv";
dotenv.config({ path: "../.env"});

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
    connection: "Username-Password-Authentication", // check this carefully
  });

  try {
    const res = await axios.post(url, payload.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
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
    grant_type: "client_credentials",
    client_id: envs.CLIENT_ID,
    client_secret: envs.CLIENT_SECRET,
    audience: envs.AUDIENCE,
  };
  const res = await axios.post(url, payload);
  return res.data.access_token;
}

// Create new user
export async function createUser(email, password) {
  const mgmtToken = await getManagementToken();
  const url = `https://${envs.DOMAIN}/api/v2/users`;
  const payload = {
    email,
    password,
    connection: "my-database",
    email_verified: false,
  };
  const res = await axios.post(url, payload, {
    headers: { Authorization: `Bearer ${mgmtToken}` },
  });
  return res.data;
}

// Refresh access token
export async function refreshAccessToken(refresh_token) {
  const url = `https://${envs.DOMAIN}/oauth/token`;
  const payload = {
    grant_type: "refresh_token",
    client_id: envs.CLIENT_ID,
    client_secret: envs.CLIENT_SECRET,
    refresh_token,
  };
  const res = await axios.post(url, payload);
  return res.data;
}
