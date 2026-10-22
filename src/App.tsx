import { useRoute } from './router'
import { DevPanel } from './components/DevPanel'
import { TopBar } from './components/TopBar'
import { SignIn } from './screens/SignIn'
import { DocumentList } from './screens/DocumentList'
import { Upload } from './screens/Upload'
import { Translating } from './screens/Translating'
import { Review } from './screens/Review'

export default function App() {
  const [screen, id] = useRoute()

  let body
  switch (screen) {
    case 'docs':
      body = <DocumentList />
      break
    case 'upload':
      body = <Upload />
      break
    case 'translating':
      body = <Translating docId={id} />
      break
    case 'review':
      body = <Review docId={id} />
      break
    default:
      return (
        <>
          <SignIn />
          <DevPanel />
        </>
      )
  }

  return (
    <div className="min-h-screen pb-24">
      <TopBar />
      {body}
      <DevPanel />
    </div>
  )
}
