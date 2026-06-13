#!/usr/bin/env python3

import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin
import base64

def scrape_comic():
    url = "https://www.gocomics.com/calvinandhobbes"
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }

    # Use a session to maintain cookies
    session = requests.Session()

    # Fetch the page
    resp = session.get(url, headers=headers)
    resp.raise_for_status()

    # Parse and find the image
    soup = BeautifulSoup(resp.text, "html.parser")
    img_tag = soup.find("img", class_="Comic-module-scss-module__3szrOa__comic__image_isStrip")

    if not img_tag:
        print("Could not find comic image on page")
        return

    img_url = urljoin(url, img_tag["src"])
    print(f"Found image: {img_url}")

    # Download the image
    img_resp = requests.get(img_url, headers=headers)
    img_resp.raise_for_status()

    # Encode as base64 to embed in HTML
    img_b64 = base64.b64encode(img_resp.content).decode("utf-8")
    content_type = img_resp.headers.get("Content-Type", "image/jpeg")

    # Create the HTML page
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Calvin and Hobbes</title>
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        html, body {{
            height: 100%;
            background: #333;
        }}
        body {{
            display: flex;
            justify-content: center;
            align-items: center;
        }}
        img {{
            max-width: 90vw;
            max-height: 90vh;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        }}
    </style>
</head>
<body>
    <img src="data:{content_type};base64,{img_b64}" alt="Calvin and Hobbes">
</body>
</html>
"""

    with open("calvinandhobbes.html", "w") as f:
        f.write(html)

    print("Created calvinandhobbes.html")

if __name__ == "__main__":
    scrape_comic()
