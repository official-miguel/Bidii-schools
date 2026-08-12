import bcrypt from "bcryptjs";

const password = "Bidii@2026";
const hash = await bcrypt.hash(password, 12);
const valid = await bcrypt.compare(password, hash);

console.log("hash:", hash);
console.log("valid:", valid);
