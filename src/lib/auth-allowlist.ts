export function isAllowedEmail(email: string | undefined) {
    const allowedEmails = (process.env.ALLOWED_EMAILS ?? "")
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);

    return Boolean(email && allowedEmails.length > 0 && allowedEmails.includes(email.toLowerCase()));
}
