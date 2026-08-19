import argparse
import getpass

from passlib.context import CryptContext

# Configuración para encriptar contraseñas con bcrypt
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def parse_args():
    parser = argparse.ArgumentParser(
        description="Generate a bcrypt hash for a password. No password is hardcoded; "
        "pass it via --password or you will be prompted (input hidden)."
    )
    parser.add_argument("--password", help="Password to hash. If omitted, you will be prompted.")
    return parser.parse_args()


def main():
    args = parse_args()
    password = args.password or getpass.getpass("Password to hash: ")
    if not password:
        raise RuntimeError("No password provided via --password or prompt.")

    hashed_password = pwd_context.hash(password)

    print("=" * 60)
    print("NUEVO HASH GENERADO:")
    print(hashed_password)
    print("=" * 60)
    print("\n👉 COPIA este hash largo y úsalo en el SQL de Supabase.")


if __name__ == "__main__":
    main()