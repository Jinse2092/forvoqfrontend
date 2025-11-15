import React from 'react';

export const StatusTimelineDropdown = ({ order, isExpanded, onToggle }) => {
  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        className="inline-flex justify-center w-full rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
        id={`status-menu-button-${order.id}`}
        aria-expanded={isExpanded}
        aria-haspopup="true"
        onClick={onToggle}
      >
        {order.status}
        <svg
          className="ml-2 -mr-1 h-5 w-5"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d={isExpanded ? "M5.23 7.21a.75.75 0 011.06.02L10 11.293l3.71-4.06a.75.75 0 111.08 1.04l-4.25 4.65a.75.75 0 01-1.08 0l-4.25-4.65a.75.75 0 01.02-1.06z" : "M14.77 12.79a.75.75 0 01-1.06-.02L10 8.707l-3.71 4.06a.75.75 0 11-1.08-1.04l4.25-4.65a.75.75 0 011.08 0l4.25 4.65a.75.75 0 01-.02 1.06z"}
            clipRule="evenodd"
          />
        </svg>
      </button>
      {isExpanded && (
        <div
          className="origin-top-left absolute left-0 mt-2 w-64 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none z-10"
          role="menu"
          aria-orientation="vertical"
          aria-labelledby={`status-menu-button-${order.id}`}
          tabIndex="-1"
        >
          <div className="py-3 px-4 space-y-2 text-sm bg-white" role="none">
            <div className="flex justify-between items-center border-b pb-2 mb-2">
              <span className="font-semibold text-gray-900">Status Timeline</span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Created:</span>
              <span className="font-medium text-gray-900">{order.date || 'pending'}{order.time ? ` ${order.time}` : ''}</span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Packed:</span>
              <span className={order.packedAt ? 'font-medium text-gray-900' : 'italic text-gray-400'}>
                {order.packedAt ? new Date(order.packedAt).toLocaleString() : 'pending'}
              </span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Dispatched:</span>
              <span className={order.dispatchedAt ? 'font-medium text-gray-900' : 'italic text-gray-400'}>
                {order.dispatchedAt ? new Date(order.dispatchedAt).toLocaleString() : 'pending'}
              </span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Delivered:</span>
              <span className={order.deliveredAt ? 'font-medium text-gray-900' : 'italic text-gray-400'}>
                {order.deliveredAt ? new Date(order.deliveredAt).toLocaleString() : 'pending'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
