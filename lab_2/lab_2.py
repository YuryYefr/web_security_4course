import os
import requests
from dotenv import load_dotenv

load_dotenv()

domain = os.getenv("DOMAIN")
print(domain)  # created my app
client_id = os.getenv("CLIENT_ID")
client_secret = os.getenv("CLIENT_SECRET")
audience = os.getenv("AUDIENCE")

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

response = requests.post(url, json=payload, headers=headers)
token_data = {}
# Parse and display result
if response.status_code == 200:
    token_data = response.json()
    print("Access token retrieved successfully!\n")
    print("Access Token:", token_data["access_token"])
    print("\nToken Type:", token_data["token_type"])
    print("Expires In:", token_data["expires_in"], "seconds")
else:
    print("Token retrieval failed:")
    print(response.status_code, response.text)

api_url = "https://api.myapp.com/data"
headers = {"Authorization": f"Bearer {token_data['access_token']}"}

api_response = requests.get(api_url, headers=headers)
print(api_response.json())

# creating user

domain = os.getenv("DOMAIN")
mgmt_token = token_data['access_token']

user_payload = {
    "email": os.getenv("EMAIL"),
    "password": os.getenv("PASSWORD"),
    "connection": "my-database",
    "email_verified": False
}

headers = {
    "Authorization": f"Bearer {mgmt_token}",
    "Content-Type": "application/json"
}

url = f"https://{domain}/api/v2/users"
response = requests.post(url, json=user_payload, headers=headers)

if response.status_code == 201:
    print("User created")
    print(response.json())
else:
    print("Error creating user:")
    print(response.status_code, response.text)
