// Vite's base keeps every original asset reachable on GitHub Pages subpaths.
export const brandAssets = {
  mascot: `${import.meta.env.BASE_URL}assets/brand/mascote-chapeu-transparente.png`,
  complete: `${import.meta.env.BASE_URL}assets/brand/logo-completo-transparente.png`,
};
export default function Brand() {
  return (
    <a className="brand" href="#" aria-label="Hackers Pai D’égua · início">
      <img
        className="brand-mascot"
        src={brandAssets.mascot}
        alt=""
        width={1728}
        height={1975}
      />
      <span className="brand-wordmark">
        HACKERS<span>PAI D’ÉGUA</span>
      </span>
    </a>
  );
}
