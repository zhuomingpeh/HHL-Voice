// Self-diagnostic harness: drives the real OpenAI Realtime session with the
// exact same system prompt, tools, and model as production, but via scripted
// TEXT turns instead of real audio/Twilio/ElevenLabs. Lets us validate
// language-switching, branch selection, and tool-calling in seconds instead
// of placing real (slow, costly, hard-to-repeat) phone calls.
//
// It does NOT exercise the audio pipeline itself (VAD, barge-in, ElevenLabs,
// AMD) — only the model's decision-making given the same instructions. Real
// test calls are still the right tool for audio-layer issues.
//
// Run: npm run test:agent

import WebSocket from "ws";
import { getAgentSettings } from "../src/lib/agentSettings";
import { buildSystemPrompt } from "../src/lib/systemPrompt";
import { REALTIME_TOOLS } from "../src/lib/realtimeTools";

const OPENAI_REALTIME_URL = "wss://api.openai.com/v1/realtime?model=gpt-realtime-2.1-mini";

interface Scenario {
  name: string;
  turns: string[];
}

const SCENARIOS: Scenario[] = [
  {
    name: "Direct question in Mandarin, repeated (regression check)",
    turns: ["你是谁", "你是谁?", "我要付款"],
  },
  {
    name: "Says 'tomorrow' in Mandarin, then adds nothing new (should not re-ask)",
    turns: ["明天明天", "没有了"],
  },
  {
    name: "Unclear/garbled input (should ask to clarify, never silence)",
    turns: ["...", "um"],
  },
  {
    name: "Confirms payment today (Branch 1, English)",
    turns: ["yes I will pay today"],
  },
  {
    name: "Already paid (Branch 2, Singlish)",
    turns: ["eh i already paid one leh"],
  },
  {
    name: "Upset customer (Branch 3)",
    turns: ["this is harassment, I never took this loan, stop calling me"],
  },
];

function containsCjk(text: string): boolean {
  return /[一-鿿]/.test(text);
}

interface TurnResult {
  customerText: string;
  assistantText: string;
  functionCalls: { name: string; args: string }[];
  wentSilent: boolean;
}

async function runScenario(scenario: Scenario): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const settings = await getAgentSettings();
  const instructions = buildSystemPrompt({
    name: "Test Customer",
    dueDate: new Date(),
    outstandingAmount: null,
    openingLine: settings.openingLine,
    additionalContext: settings.additionalContext,
  });

  console.log(`\n${"=".repeat(70)}\nSCENARIO: ${scenario.name}\n${"=".repeat(70)}`);

  const ws = new WebSocket(OPENAI_REALTIME_URL, { headers: { Authorization: `Bearer ${apiKey}` } });

  await new Promise<void>((resolve, reject) => {
    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          type: "session.update",
          session: {
            type: "realtime",
            model: "gpt-realtime-2.1-mini",
            output_modalities: ["text"],
            audio: { input: { format: { type: "audio/pcmu" }, turn_detection: null } },
            instructions,
            tools: REALTIME_TOOLS,
          },
        })
      );
      resolve();
    });
    ws.on("error", reject);
  });

  const results: TurnResult[] = [];

  // Production triggers response.create immediately after session.update,
  // before any customer audio arrives, so the model's first turn is the
  // opening line spoken on its own — not appended to its reaction to
  // whatever the customer says first. Simulate that here too, otherwise the
  // model tries to catch up on the opening line mid-reply to turn 1, which
  // looks like a language-mismatch bug but is actually a harness artifact.
  await new Promise<void>((resolve) => {
    const onMessage = (raw: WebSocket.RawData) => {
      let event: { type?: string; [key: string]: unknown };
      try {
        event = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (event.type === "response.done") {
        ws.off("message", onMessage);
        resolve();
      }
    };
    ws.on("message", onMessage);
    ws.send(JSON.stringify({ type: "response.create" }));
  });

  for (const customerText of scenario.turns) {
    let assistantText = "";
    const functionCalls: { name: string; args: string }[] = [];

    ws.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: { type: "message", role: "user", content: [{ type: "input_text", text: customerText }] },
      })
    );
    ws.send(JSON.stringify({ type: "response.create" }));

    await new Promise<void>((resolve) => {
      const onMessage = (raw: WebSocket.RawData) => {
        let event: { type?: string; [key: string]: unknown };
        try {
          event = JSON.parse(raw.toString());
        } catch {
          return;
        }

        if (event.type === "response.output_text.delta") {
          assistantText += (event.delta as string) ?? "";
        } else if (event.type === "response.output_item.done") {
          const item = event.item as { type?: string; name?: string; arguments?: string } | undefined;
          if (item?.type === "function_call" && item.name) {
            functionCalls.push({ name: item.name, args: item.arguments ?? "{}" });
          }
        } else if (event.type === "response.done") {
          ws.off("message", onMessage);
          resolve();
        } else if (event.type === "error") {
          console.error("  [error event]", JSON.stringify(event));
        }
      };
      ws.on("message", onMessage);
    });

    const wentSilent = !assistantText.trim() && functionCalls.length === 0;
    results.push({ customerText, assistantText, functionCalls, wentSilent });

    console.log(`\ncustomer: ${customerText}`);
    console.log(`assistant: ${assistantText || "(nothing — SILENT)"}`);
    if (functionCalls.length > 0) {
      console.log(`tool calls: ${functionCalls.map((f) => `${f.name}(${f.args})`).join(", ")}`);
    }
  }

  ws.close();

  // Basic automated checks
  const anySilent = results.some((r) => r.wentSilent);
  const anyMandarinInNoCjkReply = results.some(
    (r) => containsCjk(r.customerText) && r.assistantText && !containsCjk(r.assistantText)
  );

  console.log("\n--- checks ---");
  console.log(anySilent ? "FAIL: at least one turn produced no reply at all" : "OK: every turn produced a reply");
  console.log(
    anyMandarinInNoCjkReply
      ? "FAIL: replied in non-Mandarin to a Mandarin turn"
      : "OK: language matched (or no Mandarin turns in this scenario)"
  );
}

async function main() {
  const only = process.argv[2];
  const scenarios = only ? SCENARIOS.filter((s) => s.name.includes(only)) : SCENARIOS;
  for (const scenario of scenarios) {
    await runScenario(scenario);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
