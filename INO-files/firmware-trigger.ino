/*
  ESP32 Trigger Generator para NeurOne EEG (Com Blink do LED)
  - Recebe números 1–15 via Serial
  - Gera código binário de 4 bits nos pinos BIT0–BIT3
  - Pulso de 100 ms
  - Pisca o LED interno (pino 2) a cada trigger enviado
  - Buffer serial limpo para evitar duplicação
*/

// ================= CONFIGURAÇÃO =================

// Pinos digitais para os 4 bits
const int BIT0_PIN = 26; // IN1
const int BIT1_PIN = 25; // IN2
const int BIT2_PIN = 33; // IN3
const int BIT3_PIN = 32; // IN4

// Pino do LED interno do ESP32 (geralmente é o pino 2)
const int LED_PIN = 2;

// Pulso em milissegundos
const unsigned long PULSE_DURATION_MS = 100;

void setup() {
  // Configura pinos como saída
  pinMode(BIT0_PIN, OUTPUT);
  pinMode(BIT1_PIN, OUTPUT);
  pinMode(BIT2_PIN, OUTPUT);
  pinMode(BIT3_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);

  // Começa com todos LOW
  clearBits();

  Serial.begin(115200);
  Serial.println("ESP32 pronto para receber triggers 1-15 (com Blink)");
}

void loop() {
  if (Serial.available() > 0) {
    // Lê trigger do Python
    byte triggerValue = Serial.parseInt();

    // Limpa todo o buffer serial
    while (Serial.available() > 0) Serial.read();

    // Validação de 1 a 15
    if (triggerValue >= 1 && triggerValue <= 15) {
      // DEBUG: mostra no monitor serial
      Serial.print("Recebido trigger: ");
      Serial.println(triggerValue);

      sendTrigger(triggerValue);
    }
  }
}

// ================= FUNÇÕES =================
void clearBits() {
  digitalWrite(BIT0_PIN, LOW);
  digitalWrite(BIT1_PIN, LOW);
  digitalWrite(BIT2_PIN, LOW);
  digitalWrite(BIT3_PIN, LOW);
  digitalWrite(LED_PIN, LOW); // Garante que o LED apaga
}

void sendTrigger(byte value) {
  // Acende o LED interno indicando que o pulso começou
  digitalWrite(LED_PIN, HIGH);

  // Monta os 4 bits
  digitalWrite(BIT0_PIN, (value & 0b0001) ? HIGH : LOW);
  digitalWrite(BIT1_PIN, (value & 0b0010) ? HIGH : LOW);
  digitalWrite(BIT2_PIN, (value & 0b0100) ? HIGH : LOW);
  digitalWrite(BIT3_PIN, (value & 0b1000) ? HIGH : LOW);

  // DEBUG: envia linha com os bits em binário
  Serial.print("Bits enviados: ");
  Serial.print((value & 0b1000) ? 1 : 0); // BIT3 (MSB)
  Serial.print((value & 0b0100) ? 1 : 0); // BIT2
  Serial.print((value & 0b0010) ? 1 : 0); // BIT1
  Serial.println((value & 0b0001) ? 1 : 0); // BIT0 (LSB)

  delay(PULSE_DURATION_MS);

  // Apaga tudo (incluindo o LED) após a duração do pulso
  clearBits();
}