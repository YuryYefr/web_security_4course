import os
import requests

from helpers import get_management_token, envs

token_response = get_management_token()
# Parse and display result
token_data = {}
if token_response.status_code == 200:
    token_data = token_response.json()
    print("Access token retrieved successfully!\n")
    print("Access Token:", token_data["access_token"])
    print("\nToken Type:", token_data["token_type"])
    print("Expires In:", token_data["expires_in"], "seconds")
else:
    print("Token retrieval failed:")
    print(token_response.status_code, token_response.text)

# creating user

domain = os.getenv("DOMAIN")
mgmt_token = token_data['access_token']

user_payload = {
    "email": envs["EMAIL"],
    "password": envs["PASSWORD"],
    "connection": "Username-Password-Authentication",  # Default
    "email_verified": False,
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
