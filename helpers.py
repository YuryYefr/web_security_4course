import os
import socket
from urllib.parse import urlparse, parse_qs

from dotenv import load_dotenv
import requests

load_dotenv()

def get_env():
    return {
        "DOMAIN": os.getenv("DOMAIN"),
        "CLIENT_ID": os.getenv("CLIENT_ID"),
        "CLIENT_SECRET": os.getenv("CLIENT_SECRET"),
        "AUDIENCE": os.getenv("AUDIENCE"),
        "EMAIL": os.getenv("EMAIL"),
        "PASSWORD": os.getenv("PASSWORD"),
        "AUTH_CODE": os.getenv("AUTH_CODE")
    }


envs = get_env()

def auth_code_callback():
    HOST = '127.0.0.1'
    PORT = 3000
    server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server_socket.bind((HOST, PORT))
    server_socket.listen(1)
    print('server is listening on port 3000')
    while True:
        conn, addr = server_socket.accept()
        data = conn.recv(1024)
        # Extract the GET path
        first_line = data.split(b'\r\n')[0]
        path = first_line.split(b" ")[1].decode("utf-8")

        # Parse query params
        query = urlparse(path).query
        params = parse_qs(query)
        code = params.get("code", [""])[0]

        print(f"\nAUTH CODE RECEIVED: {code}\n")

        # Respond to browser
        body = "<h1>Success!</h1><p>You can close this tab.</p>"
        response = f"HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n{body}"
        conn.send(response.encode())
        conn.close()
        server_socket.close()
        return code


def get_management_token():
    domain = envs["DOMAIN"]
    print(domain)  # created my app
    client_id = envs["CLIENT_ID"]
    client_secret = envs["CLIENT_SECRET"]
    audience = envs["AUDIENCE"]
    # Token endpoint
    url = f"https://{domain}/oauth/token"

    # Auth0 client credentials payload
    payload = {
        "client_id": client_id,
        "client_secret": client_secret,
        "audience": audience,
        "grant_type": "client_credentials"
    }

    headers = {'Content-Type': 'application/json'}
    res = requests.post(url, json=payload, headers=headers)
    return res


def get_refresh_token(code):
    url = f"https://{envs['DOMAIN']}/oauth/token"
    payload = {
        "client_id": envs["CLIENT_ID"],
        "client_secret": envs["CLIENT_SECRET"],
        "grant_type": "authorization_code",
        "redirect_uri": "http://127.0.0.1:3000",
        "code": code
    }
    res = requests.post(url, json=payload)
    return res.json()
