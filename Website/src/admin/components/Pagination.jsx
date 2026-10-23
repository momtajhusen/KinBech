import { ChevronLeft, ChevronRight } from 'lucide-react';

const Pagination = ({ page, totalPages, total, limit, onPageChange }) => {
  if (totalPages <= 1) return null;

  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    
    let startPage = Math.max(1, page - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);
    
    if (endPage - startPage + 1 < maxVisible) {
      startPage = Math.max(1, endPage - maxVisible + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    return pages;
  };

  return (
    <div className="pagination-container">
      <div className="pagination-info">
        Showing <span>{start}</span> to <span>{end}</span> of <span>{total}</span> entries
      </div>
      
      <div className="pagination-controls">
        <button 
          className="pagination-btn" 
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          title="Previous Page"
        >
          <ChevronLeft className="item-icon" />
        </button>

        {getPageNumbers().map(p => (
          <button
            key={p}
            className={`pagination-btn ${p === page ? 'active' : ''}`}
            onClick={() => onPageChange(p)}
          >
            {p}
          </button>
        ))}

        <button 
          className="pagination-btn" 
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          title="Next Page"
        >
          <ChevronRight className="item-icon" />
        </button>
      </div>
    </div>
  );
};

export default Pagination;
