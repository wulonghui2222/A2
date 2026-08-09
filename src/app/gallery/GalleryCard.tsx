import Link from "next/link";

interface GalleryProject {
  id: string;
  title: string;
  description: string;
  thumbnail: string | null;
  tags: string[];
  viewCount: number;
}

export function GalleryCard({ project }: { project: GalleryProject }) {
  return (
    <Link
      href={`/projects/${project.id}`}
      className="group block rounded-2xl border border-gray-100 bg-white p-4 shadow-sm
                 transition-all hover:shadow-md hover:border-indigo-200"
    >
      {/* Thumbnail */}
      <div
        className="aspect-video rounded-xl bg-gradient-to-br from-indigo-50 to-purple-50
                      flex items-center justify-center mb-3 overflow-hidden"
      >
        {project.thumbnail ? (
          <img
            src={project.thumbnail}
            alt={project.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-3xl">🚀</span>
        )}
      </div>

      {/* Title */}
      <h3 className="font-medium text-gray-900 truncate group-hover:text-indigo-600 transition-colors">
        {project.title}
      </h3>

      {/* Description */}
      <p className="text-xs text-gray-400 mt-1 line-clamp-2">
        {project.description}
      </p>

      {/* Tags + viewCount */}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex flex-wrap gap-1">
          {project.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500"
            >
              {tag}
            </span>
          ))}
        </div>
        <span className="text-[10px] text-gray-400 shrink-0 ml-2">
          {project.viewCount} 次浏览
        </span>
      </div>
    </Link>
  );
}
