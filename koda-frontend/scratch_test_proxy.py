import requests
import json

def test_proxy():
    token = "FAKE_TOKEN_FOR_TESTING"
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Host": "kodaserver.tail0b33a9.ts.net",
        "X-Custom-Test": "Hello"
    }
    
    print("Making request to proxy...")
    resp = requests.get("http://localhost/api-facturacion/ventas", headers=headers)
    print("Status:", resp.status_code)
    print("Text:", resp.text[:200])

if __name__ == "__main__":
    test_proxy()
