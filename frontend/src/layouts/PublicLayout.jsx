import { Outlet } from 'react-router-dom';

import PublicHeader from '../components/navigation/PublicHeader/PublicHeader';
import PublicFooter from '../components/navigation/PublicFooter/PublicFooter';

function PublicLayout() {
  return (
    <div className="public-site">
      <PublicHeader />

      <main className="public-main">
        <Outlet />
      </main>

      <PublicFooter />
    </div>
  );
}

export default PublicLayout;