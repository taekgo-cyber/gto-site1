import Link from "next/link";

export function HomeSectionHeading({ id, title, description, href }: {
  id?: string; title: string; description?: string; href?: string;
}) {
  return <div className="home-section-heading">
    <h2 id={id}>{title}</h2>
    {description ? <p>{description}</p> : null}
    {href ? <Link href={href} aria-label={`${title} 더보기`}>더보기 <span aria-hidden="true">›</span></Link> : null}
  </div>;
}
