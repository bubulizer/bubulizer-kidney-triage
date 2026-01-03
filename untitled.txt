import asyncio
import sys
from playwright.async_api import async_playwright

async def run_scraper():
    async with async_playwright() as p:
        # Launch browser
        browser = await p.chromium.launch(headless=False) # Headless=False lets you see it work!
        page = await browser.new_page()
        
        print("Navigating to CapCut...")
        try:
            await page.goto("https://www.capcut.com/", timeout=60000)
            # Wait for a specific element so we know it loaded
            await page.wait_for_load_state("networkidle")
            
            # Save the HTML to a file so you can inspect it
            html = await page.content()
            with open("capcut_rendered.html", "w", encoding="utf-8") as f:
                f.write(html)
            
            print(f"Success! HTML saved to 'capcut_rendered.html' ({len(html)} characters)")
        except Exception as e:
            print(f"Scrape failed: {e}")
        finally:
            await browser.close()

if __name__ == "__main__":
    # This specific line is what fixes the NotImplementedError on Windows
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    
    asyncio.run(run_scraper())