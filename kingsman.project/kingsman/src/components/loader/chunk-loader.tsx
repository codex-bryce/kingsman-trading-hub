import { Loader } from "@deriv-com/ui";

export default function ChunkLoader({ message }: { message: string }) {
  return (
    <div className="app-root">
      <div className="kth-mini-loader" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <Loader />
      <div className="load-message">{message}</div>
    </div>
  );
}
