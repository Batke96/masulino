import pg from "pg";

const localPasswords = {
  masulino_app: "masulino_app_local",
  masulino_auth: "masulino_auth_local",
  masulino_worker: "masulino_worker_local",
} as const;

export async function ensureRoles(connectionString: string): Promise<void> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  for (const [role, password] of Object.entries(localPasswords)) {
    await client.query(
      `
        do $$
        begin
          if not exists (select from pg_roles where rolname = '${role}') then
            create role ${role} login password '${password}' nosuperuser nobypassrls nocreatedb nocreaterole;
          end if;
        end
        $$;
      `,
    );
    await client.query(
      `alter role ${role} nosuperuser nobypassrls nocreatedb nocreaterole login password '${password}'`,
    );
  }
  await client.end();
}
