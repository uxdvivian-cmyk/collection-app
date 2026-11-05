export default function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <section>
      <h1>{title}</h1>
      <div className="empty"><p className="zh">{note}</p></div>
    </section>
  )
}
