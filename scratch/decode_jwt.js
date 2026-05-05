const payload = "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1nY2ppZHJ5cmpxaWNlaWVsbXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMjEwNzEsImV4cCI6MjA4NzY5NzA3MX0";
const userPayload = "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1nY2ppZHJ5cmpxaWNlaWVsbXpwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjEyMTA3MSwiZXhwIjoyMDg3Njk3MDcxfQ";

const decode = (p) => {
    const d = Buffer.from(p, 'base64').toString();
    console.log(d);
    return JSON.parse(d).ref;
};

console.log("Anon Key Ref:");
const r1 = decode(payload);
console.log("User Token Ref:");
const r2 = decode(userPayload);

console.log("Match?", r1 === r2);
