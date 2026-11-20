import { explorerAddressUrl, shortAddress } from "@/lib/format";

/** An address shown by name or short form, linking to the chain's explorer when we know it. */
export function AddressLink({
  chainId,
  address,
  label,
}: {
  chainId: number;
  address: string;
  label?: string;
}) {
  const url = explorerAddressUrl(chainId, address);
  const text = label ?? shortAddress(address);
  return url ? (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="font-medium hover:underline"
      title={address}
    >
      {text}
    </a>
  ) : (
    <span title={address}>{text}</span>
  );
}
