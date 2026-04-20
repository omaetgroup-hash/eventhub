import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { ProductPack } from '../lib/domain';
import { usePlatform } from '../lib/platform';
import { hasPack } from '../lib/packs';

export default function RequirePack({ pack }: { pack: ProductPack }) {
  const location = useLocation();
  const { state } = usePlatform();

  if (!hasPack(state.organization.enabledPacks, pack)) {
    return <Navigate to="/app" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
