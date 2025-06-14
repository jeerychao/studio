
import { redirect } from 'next/navigation';

export default function HomePage() {
  redirect('/dashboard');
  // eslint-disable-next-line react/jsx-no-useless-fragment
  return <></>; // Or a loading spinner, but redirect is usually fast enough
}
