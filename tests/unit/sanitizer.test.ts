import { describe, test, expect } from "bun:test";
import { sanitize, sanitizeField, isDangerousCommand } from "../../src/hooks/sanitizer";

describe("sanitizer", () => {
  describe("isDangerousCommand", () => {
    test("detects cat .env", () => {
      expect(isDangerousCommand("cat .env")).toBe(true);
      expect(isDangerousCommand("cat /home/user/.env")).toBe(true);
    });

    test("detects echo $TOKEN variants", () => {
      expect(isDangerousCommand("echo $TOKEN")).toBe(true);
      expect(isDangerousCommand("echo $SECRET_KEY")).toBe(true);
      expect(isDangerousCommand("echo $API_PASSWORD")).toBe(true);
    });

    test("detects printenv and env", () => {
      expect(isDangerousCommand("printenv")).toBe(true);
      expect(isDangerousCommand("env")).toBe(true);
    });

    test("detects ssh key references", () => {
      expect(isDangerousCommand("cat ~/.ssh/id_rsa")).toBe(true);
      expect(isDangerousCommand("ssh-keygen -t rsa")).toBe(false); // generation is ok
    });

    test("allows safe commands", () => {
      expect(isDangerousCommand("ls -la")).toBe(false);
      expect(isDangerousCommand("bun test")).toBe(false);
      expect(isDangerousCommand("git status")).toBe(false);
      expect(isDangerousCommand("cat README.md")).toBe(false);
    });
  });

  describe("sanitize", () => {
    test("masks bot token patterns", () => {
      const text = "token is 123456789:AAHfiqksKZ8WbR3xyzabcdefghijklmnop";
      expect(sanitize(text)).not.toContain("AAHfiqksKZ8");
      expect(sanitize(text)).toContain("****");
    });

    test("masks API key patterns (sk-...)", () => {
      const text = "key: sk-abcdefghij1234567890abcdefghij1234567890ab";
      expect(sanitize(text)).not.toContain("sk-abcdefghij");
      expect(sanitize(text)).toContain("****");
    });

    test("returns hidden message for dangerous commands", () => {
      expect(sanitize("cat .env")).toBe("[보안상 내용이 숨겨졌습니다]");
      expect(sanitize("printenv")).toBe("[보안상 내용이 숨겨졌습니다]");
    });

    test("truncates long output to 200 chars", () => {
      const longText = "a".repeat(500);
      expect(sanitize(longText).length).toBeLessThanOrEqual(200);
    });

    test("passes through safe text unchanged", () => {
      const text = "bun test completed: 10 passed";
      expect(sanitize(text)).toBe(text);
    });
  });

  describe("sanitizeField", () => {
    test("masks values for sensitive field names", () => {
      expect(sanitizeField("password", "my-secret-pw")).toBe("****");
      expect(sanitizeField("token", "abc123")).toBe("****");
      expect(sanitizeField("secret", "xyz")).toBe("****");
      expect(sanitizeField("api_key", "sk-123")).toBe("****");
    });

    test("passes through non-sensitive fields", () => {
      expect(sanitizeField("project_id", "my-project")).toBe("my-project");
      expect(sanitizeField("chat_id", "12345")).toBe("12345");
    });
  });
});
