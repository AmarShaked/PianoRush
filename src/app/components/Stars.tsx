interface StarsProps {
  count: number;
  small?: boolean;
  animate?: boolean;
}

/** Three-star rating; earned stars are filled. Count is announced via aria-label. */
export function Stars({ count, small, animate }: StarsProps) {
  return (
    <span className={`stars${small ? ' small' : ''}`} role="img" aria-label={`${count} of 3 stars`}>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={`star${i <= count ? ' on' : ''}${animate && i <= count ? ' pop' : ''}`}
          style={animate ? { animationDelay: `${i * 160}ms` } : undefined}
          aria-hidden
        >
          ★
        </span>
      ))}
    </span>
  );
}
