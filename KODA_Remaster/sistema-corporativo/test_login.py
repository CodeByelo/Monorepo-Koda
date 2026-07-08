import asyncio
import httpx

async def test():
    async with httpx.AsyncClient() as client:
        # Try to login as Hrodriguez
        # I don't know the password, but I can use a known DEV user if any, or just check the users table.
        pass

asyncio.run(test())
