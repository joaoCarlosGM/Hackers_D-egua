/**
 * Dados sintéticos da demonstração de integridade (CTF revisão).
 * A evidência legítima foi escolhida para que SHA-256 do arquivo termine em c4e1.
 * MD5 verifica a flag como texto, sem quebra de linha; não é criptografia.
 * Flags/validações locais NÃO são seguras para um CTF oficial pontuado.
 */
export const reviewHashFixture = {
  evidenceDirectory: "/opt/evidencias",
  evidenceFile: "/opt/evidencias/registro_27.txt",
  fileHeader: "HACKERS PAI D'EGUA | Evidencia legitima de integridade",
  flag: "FLAG{MD5_SHA256_INTEGRIDADE_096836}",
  sha256Suffix: "c4e1",
  sha256File: "f2fad39f0d99b44408f1bc562e0d41a5f40f538deff54bdc588b87f78143c4e1",
  md5Flag: "a67ac8c054f704be2673a9a7c72cffa8",
} as const;
