import urllib
import webbrowser

import requests
import json

from helpers import envs, get_management_token, auth_code_callback, get_refresh_token

token = get_management_token().json()['access_token']
audience = envs["AUDIENCE"]
auth_payload = {
    "audience": envs["AUDIENCE"],
    "scope": "openid profile email offline_access",
    "response_type": "code",
    "client_id": envs["CLIENT_ID"],
    "redirect_uri": "http://127.0.0.1:3000",
    "state": "xyz123"
}
auth_url = f"https://{envs['DOMAIN']}/authorize?{urllib.parse.urlencode(auth_payload)}"
# TODO try selenium or else
webbrowser.open(auth_url)
auth_code = auth_code_callback()


# update user password
def get_user_id():
    url = f"{audience}users-by-email"
    headers = {"Authorization": f"Bearer {token}"}
    params = {"email": envs["EMAIL"]}

    res = requests.get(url, headers=headers, params=params)

    return res.json()[0]['user_id']


user_id = get_user_id()
url = f"{audience}users/{user_id}"

payload = json.dumps({
    "connection": 'Username-Password-Authentication',
    "password": envs["PASSWORD"]  # not a mistake, it's just to represent flow
})
headers = {
    'Content-Type': 'application/json',
    "Authorization": f"Bearer {token}",
    'Accept': 'application/json'
}

response = requests.request("PATCH", url, headers=headers, data=payload)

print(response.text)
tokens = get_refresh_token(auth_code)
# refresh token
domain = envs["DOMAIN"]
print(tokens.json())  # okay, seems that M2M cannot refresh token(only after user login)
